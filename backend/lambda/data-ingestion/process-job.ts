/**
 * Process Job Lambda Function
 * 
 * Orchestrates the data ingestion pipeline:
 * 1. Retrieves job record from Jobs table
 * 2. Retrieves and decrypts user OAuth tokens
 * 3. Fetches messages from Gmail and Slack APIs
 * 4. Normalizes and deduplicates messages
 * 5. Stores messages in Messages table
 * 6. Updates job status to DONE or FAILED
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'crypto';
import { getUserOAuthTokens } from './shared/token-manager';
import { createGmailClient, GmailAuthError, GmailRateLimitError } from './shared/gmail-client';
import { createSlackClient, SlackAuthError, SlackRateLimitError } from './shared/slack-client';
import { normalizeGmailMessage, normalizeSlackMessage, NormalizedMessage } from './shared/normalization';
import { storeMessagesWithDeduplication } from './shared/deduplication';

// Environment variables
const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const MESSAGES_TABLE_NAME = process.env.MESSAGES_TABLE_NAME!;

// Initialize AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudwatchClient = new CloudWatchClient({});
const eventBridgeClient = new EventBridgeClient({});

/**
 * Job record structure
 */
interface JobRecord {
  jobId: string;
  userId: string;
  status: 'PROCESSING' | 'DONE' | 'FAILED';
  startDate: string;
  endDate: string;
  searchTopic?: string;
  createdAt: string;
  completedAt?: string;
  messageCount?: number;
  errorMessage?: string;
}

/**
 * CloudWatch metrics dimensions
 */
interface MetricDimensions {
  UserId: string;
  Source?: string;
  ErrorType?: string;
}

/**
 * Retrieves job record from DynamoDB
 */
async function getJobRecord(jobId: string): Promise<JobRecord | null> {
  const command = new GetCommand({
    TableName: JOBS_TABLE_NAME,
    Key: { jobId },
  });

  const response = await dynamoClient.send(command);
  return response.Item as JobRecord | null;
}

/**
 * Updates job status to DONE with message count
 */
async function updateJobToDone(jobId: string, messageCount: number): Promise<void> {
  const completedAt = new Date().toISOString();
  
  const command = new UpdateCommand({
    TableName: JOBS_TABLE_NAME,
    Key: { jobId },
    UpdateExpression: 'SET #status = :status, completedAt = :completedAt, messageCount = :messageCount',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': 'DONE',
      ':completedAt': completedAt,
      ':messageCount': messageCount,
    },
  });

  await dynamoClient.send(command);
}

/**
 * Updates job status to FAILED with error message
 */
async function updateJobToFailed(jobId: string, errorMessage: string): Promise<void> {
  const completedAt = new Date().toISOString();
  
  const command = new UpdateCommand({
    TableName: JOBS_TABLE_NAME,
    Key: { jobId },
    UpdateExpression: 'SET #status = :status, completedAt = :completedAt, errorMessage = :errorMessage',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': 'FAILED',
      ':completedAt': completedAt,
      ':errorMessage': errorMessage,
    },
  });

  await dynamoClient.send(command);
}

/**
 * Emits a CloudWatch metric
 */
async function emitMetric(
  metricName: string,
  value: number,
  dimensions: MetricDimensions,
  unit: 'Count' | 'Milliseconds' = 'Count'
): Promise<void> {
  try {
    const command = new PutMetricDataCommand({
      Namespace: 'FlowRecall/DataIngestion',
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value })),
        },
      ],
    });

    await cloudwatchClient.send(command);
  } catch (error) {
    // Log but don't fail the job if metrics emission fails
    console.error('Failed to emit CloudWatch metric', {
      metricName,
      value,
      dimensions,
      error: (error as Error).message,
    });
  }
}

/**
 * Publishes job completion event to EventBridge
 */
async function publishJobCompletedEvent(jobId: string, userId: string, messageCount: number): Promise<void> {
  try {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'flow-recall.data-ingestion',
          DetailType: 'Job Completed',
          Detail: JSON.stringify({
            jobId,
            userId,
            status: 'DONE',
            messageCount,
            completedAt: new Date().toISOString(),
          }),
        },
      ],
    });

    await eventBridgeClient.send(command);
    console.log('Published job completion event to EventBridge', { jobId, userId, messageCount });
  } catch (error) {
    // Log but don't fail the job if event publishing fails
    console.error('Failed to publish EventBridge event', {
      jobId,
      userId,
      error: (error as Error).message,
    });
  }
}

/**
 * Logs structured error to CloudWatch
 */
function logError(
  level: 'ERROR' | 'WARN',
  jobId: string,
  userId: string,
  errorType: string,
  errorMessage: string,
  errorDetails?: any
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    jobId,
    userId,
    errorType,
    errorMessage,
    errorDetails,
  }));
}

/**
 * Main job processing logic
 */
async function processJob(jobId: string): Promise<void> {
  const startTime = Date.now();
  let job: JobRecord | null = null;

  try {
    // 1. Retrieve job record
    job = await getJobRecord(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    console.log('Processing job', {
      jobId: job.jobId,
      userId: job.userId,
      startDate: job.startDate,
      endDate: job.endDate,
      searchTopic: job.searchTopic,
    });

    // 2. Retrieve and decrypt OAuth tokens
    let tokens;
    try {
      tokens = await getUserOAuthTokens(job.userId);
    } catch (error) {
      const errorMessage = `Failed to retrieve OAuth tokens: ${(error as Error).message}`;
      logError('ERROR', jobId, job.userId, 'OAUTH', errorMessage, error);
      await updateJobToFailed(jobId, errorMessage);
      await emitMetric('JobFailed', 1, { UserId: job.userId, ErrorType: 'OAUTH' });
      return;
    }

    const allMessages: NormalizedMessage[] = [];
    let gmailMessageCount = 0;
    let slackMessageCount = 0;

    // 3. Fetch Gmail messages if tokens available
    if (tokens.gmail) {
      try {
        console.log('Fetching Gmail messages', { jobId, userId: job.userId });
        const gmailClient = createGmailClient(tokens.gmail);
        const gmailMessages = await gmailClient.fetchMessages({
          startDate: job.startDate,
          endDate: job.endDate,
          searchTopic: job.searchTopic,
        });

        // Normalize Gmail messages
        for (const gmailMessage of gmailMessages) {
          const messageId = randomUUID();
          const normalized = normalizeGmailMessage(gmailMessage, jobId, messageId);
          allMessages.push(normalized);
        }

        gmailMessageCount = gmailMessages.length;
        console.log('Gmail messages fetched and normalized', {
          jobId,
          count: gmailMessageCount,
        });

        await emitMetric('MessagesFetched', gmailMessageCount, {
          UserId: job.userId,
          Source: 'gmail',
        });
      } catch (error) {
        if (error instanceof GmailAuthError) {
          const errorMessage = `Gmail authentication failed: ${error.message}`;
          logError('ERROR', jobId, job.userId, 'OAUTH', errorMessage, error);
          await updateJobToFailed(jobId, errorMessage);
          await emitMetric('JobFailed', 1, { UserId: job.userId, ErrorType: 'OAUTH', Source: 'gmail' });
          return;
        }
        
        // For other errors, log but continue with Slack
        logError('WARN', jobId, job.userId, 'API', `Gmail fetch failed: ${(error as Error).message}`, error);
        await emitMetric('APIRetries', 1, { UserId: job.userId, Source: 'gmail', ErrorType: 'FAILED' });
      }
    }

    // 4. Fetch Slack messages if tokens available
    if (tokens.slack) {
      try {
        console.log('Fetching Slack messages', { jobId, userId: job.userId });
        const slackClient = createSlackClient(tokens.slack);
        const slackMessages = await slackClient.fetchMessages({
          startDate: job.startDate,
          endDate: job.endDate,
          searchTopic: job.searchTopic,
        });

        // Normalize Slack messages
        for (const slackMessage of slackMessages) {
          const messageId = randomUUID();
          const normalized = normalizeSlackMessage(slackMessage, jobId, messageId);
          allMessages.push(normalized);
        }

        slackMessageCount = slackMessages.length;
        console.log('Slack messages fetched and normalized', {
          jobId,
          count: slackMessageCount,
        });

        await emitMetric('MessagesFetched', slackMessageCount, {
          UserId: job.userId,
          Source: 'slack',
        });
      } catch (error) {
        if (error instanceof SlackAuthError) {
          const errorMessage = `Slack authentication failed: ${error.message}`;
          logError('ERROR', jobId, job.userId, 'OAUTH', errorMessage, error);
          await updateJobToFailed(jobId, errorMessage);
          await emitMetric('JobFailed', 1, { UserId: job.userId, ErrorType: 'OAUTH', Source: 'slack' });
          return;
        }
        
        // For other errors, log but continue
        logError('WARN', jobId, job.userId, 'API', `Slack fetch failed: ${(error as Error).message}`, error);
        await emitMetric('APIRetries', 1, { UserId: job.userId, Source: 'slack', ErrorType: 'FAILED' });
      }
    }

    // 5. Deduplicate and store messages
    console.log('Storing messages with deduplication', {
      jobId,
      totalMessages: allMessages.length,
    });

    const deduplicationResult = await storeMessagesWithDeduplication(
      allMessages,
      MESSAGES_TABLE_NAME
    );

    console.log('Messages stored successfully', {
      jobId,
      storedCount: deduplicationResult.storedCount,
      duplicateCount: deduplicationResult.duplicateCount,
    });

    await emitMetric('MessagesDeduplicated', deduplicationResult.duplicateCount, {
      UserId: job.userId,
    });

    // 6. Update job status to DONE
    await updateJobToDone(jobId, deduplicationResult.storedCount);

    // 7. Publish job completion event to EventBridge
    await publishJobCompletedEvent(jobId, job.userId, deduplicationResult.storedCount);

    const processingDuration = Date.now() - startTime;
    await emitMetric('JobCompleted', 1, { UserId: job.userId });
    await emitMetric('ProcessingDuration', processingDuration, { UserId: job.userId }, 'Milliseconds');

    console.log('Job completed successfully', {
      jobId,
      userId: job.userId,
      messageCount: deduplicationResult.storedCount,
      processingDuration,
    });
  } catch (error) {
    const errorMessage = `Job processing failed: ${(error as Error).message}`;
    
    if (job) {
      logError('ERROR', jobId, job.userId, 'SYSTEM', errorMessage, error);
      await updateJobToFailed(jobId, errorMessage);
      await emitMetric('JobFailed', 1, { UserId: job.userId, ErrorType: 'SYSTEM' });
    } else {
      console.error('Failed to process job', {
        jobId,
        error: errorMessage,
      });
    }

    throw error;
  }
}

/**
 * Lambda handler
 */
export async function handler(event: { jobId: string }): Promise<void> {
  const { jobId } = event;

  if (!jobId) {
    throw new Error('jobId is required in event payload');
  }

  await processJob(jobId);
}

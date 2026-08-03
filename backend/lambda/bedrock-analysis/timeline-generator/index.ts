/**
 * Timeline Generator Lambda Handler
 * Constructs chronological timelines from stored messages using Amazon Bedrock
 * 
 * This Lambda function:
 * 1. Retrieves messages from DynamoDB Messages table
 * 2. Sorts messages chronologically by timestamp
 * 3. Invokes Bedrock to construct a timeline of project-related events
 * 4. Stores structured timeline results in DynamoDB Analysis table
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { BedrockClient } from '../shared/bedrock-client';
import { retrieveMessages, MessageRecord } from '../shared/message-retrieval';
import {
  constructTimelineGenerationPrompt,
  TIMELINE_GENERATION_SYSTEM_PROMPT,
} from '../shared/prompts';

/**
 * Event interface for Job Completed events from EventBridge
 * Same interface as Message_Analyzer
 */
export interface EventBridgeEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: JobCompletedEvent;
}

export interface JobCompletedEvent {
  jobId: string;
  userId: string;
  status: string;
  messageCount: number;
  completedAt: string;
}

/**
 * Timeline entry from Bedrock response
 */
interface TimelineEntry {
  timestamp: string;
  event: string;
  messageId: string;
}

/**
 * Timeline generation response from Bedrock
 */
interface TimelineGenerationResponse {
  timeline: TimelineEntry[];
}

/**
 * Analysis record stored in DynamoDB
 */
interface AnalysisRecord {
  analysisId: string;
  jobId: string;
  userId: string;
  analysisType: 'timeline';
  createdAt: string;
  messageIds: string[];
  timeline: TimelineEntry[];
}

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Initialize Bedrock client
const bedrockClient = new BedrockClient({
  modelId: process.env.MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0',
});

// Environment variables
const MESSAGES_TABLE_NAME = process.env.MESSAGES_TABLE_NAME || 'messages';
const ANALYSIS_TABLE_NAME = process.env.ANALYSIS_TABLE_NAME || 'bedrock-analysis';

/**
 * Main Lambda handler
 * Processes Job Completed events and generates timelines from messages
 */
export async function handler(event: EventBridgeEvent): Promise<void> {
  // Subtask 6.1: Parse event and add structured logging
  const { jobId, userId, messageCount, completedAt } = event.detail;

  console.log('Timeline Generator invoked', {
    jobId,
    userId,
    messageCount,
    completedAt,
    timestamp: new Date().toISOString(),
  });

  try {
    // Subtask 6.2: Retrieve messages from Messages table
    let messages: MessageRecord[];
    try {
      messages = await retrieveMessages(jobId, {
        tableName: MESSAGES_TABLE_NAME,
      });

      console.log('Messages retrieved successfully', {
        jobId,
        retrievedCount: messages.length,
      });
    } catch (error) {
      // Subtask 6.4: Handle message retrieval failures
      console.error('Message retrieval failed', {
        jobId,
        userId,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
      });

      throw new Error(`Failed to retrieve messages: ${(error as Error).message}`);
    }

    // Subtask 6.2: Handle empty message set (return empty timeline)
    if (messages.length === 0) {
      console.log('No messages found for jobId, returning empty timeline', {
        jobId,
      });

      // Store empty timeline result
      const emptyAnalysisRecord: AnalysisRecord = {
        analysisId: randomUUID(),
        jobId,
        userId,
        analysisType: 'timeline',
        createdAt: new Date().toISOString(),
        messageIds: [],
        timeline: [],
      };

      await storeTimelineResult(emptyAnalysisRecord, userId);

      return;
    }

    // Subtask 6.2: Sort messages chronologically by timestamp
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    console.log('Messages sorted chronologically', {
      jobId,
      messageCount: sortedMessages.length,
      earliestTimestamp: sortedMessages[0]?.timestamp,
      latestTimestamp: sortedMessages[sortedMessages.length - 1]?.timestamp,
    });

    // Subtask 6.2: Construct timeline generation prompt with sorted messages
    const prompt = constructTimelineGenerationPrompt(
      sortedMessages.map(msg => ({
        messageId: msg.messageId,
        timestamp: msg.timestamp,
        source: msg.source,
        sender: msg.sender,
        subject: msg.subject,
        content: msg.text, // Map 'text' field to 'content' for prompt formatting
      }))
    );

    console.log('Timeline generation prompt constructed', {
      jobId,
      promptLength: prompt.length,
      messageCount: sortedMessages.length,
    });

    // Subtask 6.2: Invoke Bedrock
    let timelineResponse: TimelineGenerationResponse;
    try {
      const bedrockResponse = await bedrockClient.invoke<TimelineGenerationResponse>({
        prompt,
        systemPrompt: TIMELINE_GENERATION_SYSTEM_PROMPT,
      });

      if (!bedrockResponse.success) {
        // Subtask 6.4: Handle Bedrock invocation failures
        console.error('Bedrock invocation failed', {
          jobId,
          userId,
          errorType: bedrockResponse.error?.type,
          errorMessage: bedrockResponse.error?.message,
        });

        throw new Error(
          `Bedrock invocation failed: ${bedrockResponse.error?.message}`
        );
      }

      timelineResponse = bedrockResponse.data!;

      console.log('Bedrock invocation successful', {
        jobId,
        timelineEntriesCount: timelineResponse.timeline.length,
      });
    } catch (error) {
      // Subtask 6.4: Handle unexpected errors during Bedrock invocation
      console.error('Unexpected error during Bedrock invocation', {
        jobId,
        userId,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
      });

      throw error;
    }

    // Subtask 6.2: Parse response (already done by BedrockClient)
    // Validate that response has expected structure
    try {
      validateTimelineResponse(timelineResponse);
    } catch (error) {
      // Subtask 6.4: Handle JSON parsing/validation failures
      console.error('JSON validation failed', {
        jobId,
        userId,
        error: (error as Error).message,
        response: JSON.stringify(timelineResponse).substring(0, 500),
      });

      throw new Error(`Invalid response structure: ${(error as Error).message}`);
    }

    // Subtask 6.3: Generate unique analysisId and create AnalysisRecord
    const analysisId = randomUUID();
    const createdAt = new Date().toISOString();
    const messageIds = sortedMessages.map(msg => msg.messageId);

    const analysisRecord: AnalysisRecord = {
      analysisId,
      jobId,
      userId,
      analysisType: 'timeline',
      createdAt,
      messageIds,
      timeline: timelineResponse.timeline,
    };

    console.log('Timeline record created', {
      analysisId,
      jobId,
      userId,
      messageIdsCount: messageIds.length,
      timelineEntriesCount: timelineResponse.timeline.length,
    });

    // Subtask 6.3: Store record in Analysis table
    await storeTimelineResult(analysisRecord, userId);

    console.log('Timeline generation completed successfully', {
      analysisId,
      jobId,
      userId,
    });
  } catch (error) {
    // Top-level error handler
    console.error('Timeline Generator execution failed', {
      jobId,
      userId,
      error: (error as Error).message,
      errorStack: (error as Error).stack,
    });

    throw error;
  }
}

/**
 * Store timeline result in DynamoDB Analysis table
 * Subtask 6.3 & 6.4: Store record with error handling
 */
async function storeTimelineResult(
  record: AnalysisRecord,
  userId: string
): Promise<void> {
  try {
    const command = new PutCommand({
      TableName: ANALYSIS_TABLE_NAME,
      Item: record,
    });

    await docClient.send(command);

    console.log('Timeline result stored successfully', {
      analysisId: record.analysisId,
      jobId: record.jobId,
      userId: record.userId,
    });
  } catch (error) {
    // Subtask 6.4: Handle DynamoDB storage failures
    console.error('Failed to store timeline result', {
      analysisId: record.analysisId,
      jobId: record.jobId,
      userId: record.userId,
      error: (error as Error).message,
      errorStack: (error as Error).stack,
    });

    throw new Error(`Failed to store timeline: ${(error as Error).message}`);
  }
}

/**
 * Validate timeline generation response structure
 * Ensures response has all required fields with correct types
 */
function validateTimelineResponse(response: any): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Response is not an object');
  }

  // Check required timeline array
  if (!Array.isArray(response.timeline)) {
    throw new Error('Missing or invalid field: timeline');
  }

  // Validate each timeline entry has required fields
  for (const entry of response.timeline) {
    if (!entry.timestamp || typeof entry.timestamp !== 'string') {
      throw new Error('Timeline entry missing valid timestamp field');
    }
    if (!entry.event || typeof entry.event !== 'string') {
      throw new Error('Timeline entry missing valid event field');
    }
    if (!entry.messageId || typeof entry.messageId !== 'string') {
      throw new Error('Timeline entry missing valid messageId field');
    }
  }
}

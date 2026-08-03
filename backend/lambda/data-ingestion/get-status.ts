import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;

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
 * Extract userId from Cognito JWT claims
 */
function extractUserId(event: APIGatewayProxyEvent): string | null {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) {
    return null;
  }
  
  // Cognito provides 'sub' claim which is the user's unique identifier
  return claims.sub || null;
}

/**
 * Extract jobId from path parameters
 */
function extractJobId(event: APIGatewayProxyEvent): string | null {
  return event.pathParameters?.jobId || null;
}

/**
 * Retrieve job record from DynamoDB
 */
async function getJobRecord(jobId: string): Promise<JobRecord | null> {
  const getCommand = new GetItemCommand({
    TableName: JOBS_TABLE_NAME,
    Key: {
      jobId: { S: jobId },
    },
  });

  const result = await dynamoClient.send(getCommand);

  if (!result.Item) {
    return null;
  }

  return unmarshall(result.Item) as JobRecord;
}

/**
 * Format status response with conditional fields
 */
function formatStatusResponse(job: JobRecord): object {
  const response: any = {
    jobId: job.jobId,
    userId: job.userId,
    status: job.status,
    startDate: job.startDate,
    endDate: job.endDate,
    createdAt: job.createdAt,
  };

  // Include searchTopic if present
  if (job.searchTopic) {
    response.searchTopic = job.searchTopic;
  }

  // Include completedAt if present
  if (job.completedAt) {
    response.completedAt = job.completedAt;
  }

  // Include messageCount if status is "DONE"
  if (job.status === 'DONE' && job.messageCount !== undefined) {
    response.messageCount = job.messageCount;
  }

  // Include errorMessage if status is "FAILED"
  if (job.status === 'FAILED' && job.errorMessage) {
    response.errorMessage = job.errorMessage;
  }

  return response;
}

/**
 * Lambda handler for retrieving job status
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Extract userId from Cognito claims
    const userId = extractUserId(event);
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Unauthorized: Invalid or missing authentication token',
        }),
      };
    }

    // Extract jobId from path parameters
    const jobId = extractJobId(event);
    if (!jobId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'jobId is required in path parameters',
        }),
      };
    }

    // Query Jobs table for job record
    const job = await getJobRecord(jobId);

    // Return 404 if job not found
    if (!job) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Job not found',
        }),
      };
    }

    // Verify ownership - compare requesting userId with job's userId
    if (job.userId !== userId) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Forbidden: You do not have permission to access this job',
        }),
      };
    }

    // Format and return status response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(formatStatusResponse(job)),
    };
  } catch (error) {
    console.error('Error retrieving job status:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
      }),
    };
  }
}

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import { randomUUID } from 'crypto';
import { validateDataPullRequest } from './shared/validation';

const dynamoClient = new DynamoDBClient({});
const lambdaClient = new LambdaClient({});

const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME!;
const PROCESS_JOB_FUNCTION_NAME = process.env.PROCESS_JOB_FUNCTION_NAME!;

interface CreateJobRequest {
  startDate: string;
  endDate: string;
  searchTopic?: string;
}

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
 * Parse and validate request body
 */
function parseAndValidateRequest(event: APIGatewayProxyEvent): {
  success: boolean;
  data?: CreateJobRequest;
  error?: string;
} {
  // Parse request body
  if (!event.body) {
    return {
      success: false,
      error: 'Request body is required',
    };
  }

  let requestBody: CreateJobRequest;
  try {
    requestBody = JSON.parse(event.body);
  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON in request body',
    };
  }

  // Check required fields
  if (!requestBody.startDate || !requestBody.endDate) {
    return {
      success: false,
      error: 'startDate and endDate are required',
    };
  }

  // Validate using shared utilities
  const validation = validateDataPullRequest(
    requestBody.startDate,
    requestBody.endDate,
    requestBody.searchTopic
  );

  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  return {
    success: true,
    data: requestBody,
  };
}

/**
 * Check concurrent job limit for user
 */
async function checkConcurrentJobLimit(userId: string): Promise<{
  allowed: boolean;
  count: number;
}> {
  const queryCommand = new QueryCommand({
    TableName: JOBS_TABLE_NAME,
    IndexName: 'UserIdStatusIndex',
    KeyConditionExpression: 'userId = :userId AND #status = :status',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: marshall({
      ':userId': userId,
      ':status': 'PROCESSING',
    }),
    Select: 'COUNT',
  });

  const result = await dynamoClient.send(queryCommand);
  const count = result.Count || 0;

  return {
    allowed: count < 5,
    count,
  };
}

/**
 * Create job record in DynamoDB
 */
async function createJobRecord(
  userId: string,
  request: CreateJobRequest
): Promise<JobRecord> {
  const jobId = randomUUID();
  const createdAt = new Date().toISOString();

  const jobRecord: JobRecord = {
    jobId,
    userId,
    status: 'PROCESSING',
    startDate: request.startDate,
    endDate: request.endDate,
    createdAt,
  };

  // Add optional searchTopic if provided
  if (request.searchTopic) {
    jobRecord.searchTopic = request.searchTopic;
  }

  const putCommand = new PutItemCommand({
    TableName: JOBS_TABLE_NAME,
    Item: marshall(jobRecord),
  });

  await dynamoClient.send(putCommand);

  return jobRecord;
}

/**
 * Invoke Process Job Lambda asynchronously
 */
async function invokeProcessJobLambda(jobId: string): Promise<void> {
  const invokeCommand = new InvokeCommand({
    FunctionName: PROCESS_JOB_FUNCTION_NAME,
    InvocationType: 'Event', // Asynchronous invocation
    Payload: JSON.stringify({ jobId }),
  });

  await lambdaClient.send(invokeCommand);
}

/**
 * Lambda handler for creating a new data ingestion job
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

    // Parse and validate request
    const parseResult = parseAndValidateRequest(event);
    if (!parseResult.success) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: parseResult.error,
        }),
      };
    }

    const request = parseResult.data!;

    // Check concurrent job limit
    const limitCheck = await checkConcurrentJobLimit(userId);
    if (!limitCheck.allowed) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: `Concurrent job limit reached. You have ${limitCheck.count} jobs currently processing. Maximum allowed: 5`,
        }),
      };
    }

    // Create job record
    const jobRecord = await createJobRecord(userId, request);

    // Invoke Process Job Lambda asynchronously
    await invokeProcessJobLambda(jobRecord.jobId);

    // Return success response
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        jobId: jobRecord.jobId,
        status: jobRecord.status,
        startDate: jobRecord.startDate,
        endDate: jobRecord.endDate,
        ...(jobRecord.searchTopic && { searchTopic: jobRecord.searchTopic }),
        createdAt: jobRecord.createdAt,
      }),
    };
  } catch (error) {
    console.error('Error creating job:', error);
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

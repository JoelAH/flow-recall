/**
 * Message Analyzer Lambda Handler
 * Extracts actionable insights from stored messages using Amazon Bedrock
 * 
 * This Lambda function:
 * 1. Retrieves messages from DynamoDB Messages table
 * 2. Invokes Bedrock to extract decisions, risks, tasks, and deadlines
 * 3. Stores structured analysis results in DynamoDB Analysis table
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { BedrockClient } from '../shared/bedrock-client';
import { retrieveMessages, MessageRecord } from '../shared/message-retrieval';
import {
  constructInsightExtractionPrompt,
  INSIGHT_EXTRACTION_SYSTEM_PROMPT,
} from '../shared/prompts';

/**
 * Event interface for Job Completed events from EventBridge
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
 * Insight extraction response from Bedrock
 */
interface Decision {
  text: string;
  context: string;
  messageId: string;
}

interface Risk {
  text: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  messageId: string;
}

interface Task {
  text: string;
  priority: 'high' | 'medium' | 'low';
  messageId: string;
}

interface Deadline {
  text: string;
  date: string;
  messageId: string;
}

interface InsightExtractionResponse {
  decisions: Decision[];
  risks: Risk[];
  tasks: Task[];
  deadlines: Deadline[];
}

/**
 * Analysis record stored in DynamoDB
 */
interface AnalysisRecord {
  analysisId: string;
  jobId: string;
  userId: string;
  analysisType: 'insights';
  createdAt: string;
  messageIds: string[];
  decisions: Decision[];
  risks: Risk[];
  tasks: Task[];
  deadlines: Deadline[];
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
 * Processes Job Completed events and extracts insights from messages
 */
export async function handler(event: EventBridgeEvent): Promise<void> {
  // Subtask 5.1: Parse event and add structured logging
  const { jobId, userId, messageCount, completedAt } = event.detail;

  console.log('Message Analyzer invoked', {
    jobId,
    userId,
    messageCount,
    completedAt,
    timestamp: new Date().toISOString(),
  });

  try {
    // Subtask 5.2: Retrieve messages from Messages table
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
      // Subtask 5.4: Handle message retrieval failures
      console.error('Message retrieval failed', {
        jobId,
        userId,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
      });

      throw new Error(`Failed to retrieve messages: ${(error as Error).message}`);
    }

    // Subtask 5.2: Handle empty message set
    if (messages.length === 0) {
      console.log('No messages found for jobId, returning empty analysis', {
        jobId,
      });

      // Store empty analysis result
      const emptyAnalysisRecord: AnalysisRecord = {
        analysisId: randomUUID(),
        jobId,
        userId,
        analysisType: 'insights',
        createdAt: new Date().toISOString(),
        messageIds: [],
        decisions: [],
        risks: [],
        tasks: [],
        deadlines: [],
      };

      await storeAnalysisResult(emptyAnalysisRecord, userId);

      return;
    }

    // Subtask 5.2: Construct insight extraction prompt
    const prompt = constructInsightExtractionPrompt(
      messages.map(msg => ({
        messageId: msg.messageId,
        timestamp: msg.timestamp,
        source: msg.source,
        sender: msg.sender,
        subject: msg.subject,
        content: msg.text, // Map 'text' field to 'content' for prompt formatting
      }))
    );

    console.log('Insight extraction prompt constructed', {
      jobId,
      promptLength: prompt.length,
      messageCount: messages.length,
    });

    // Subtask 5.2: Invoke Bedrock
    let insightResponse: InsightExtractionResponse;
    try {
      const bedrockResponse = await bedrockClient.invoke<InsightExtractionResponse>({
        prompt,
        systemPrompt: INSIGHT_EXTRACTION_SYSTEM_PROMPT,
      });

      if (!bedrockResponse.success) {
        // Subtask 5.4: Handle Bedrock invocation failures
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

      insightResponse = bedrockResponse.data!;

      console.log('Bedrock invocation successful', {
        jobId,
        decisionsCount: insightResponse.decisions.length,
        risksCount: insightResponse.risks.length,
        tasksCount: insightResponse.tasks.length,
        deadlinesCount: insightResponse.deadlines.length,
      });
    } catch (error) {
      // Subtask 5.4: Handle unexpected errors during Bedrock invocation
      console.error('Unexpected error during Bedrock invocation', {
        jobId,
        userId,
        error: (error as Error).message,
        errorStack: (error as Error).stack,
      });

      throw error;
    }

    // Subtask 5.2: Parse response (already done by BedrockClient)
    // Validate that response has expected structure
    try {
      validateInsightResponse(insightResponse);
    } catch (error) {
      // Subtask 5.4: Handle JSON parsing/validation failures
      console.error('JSON validation failed', {
        jobId,
        userId,
        error: (error as Error).message,
        response: JSON.stringify(insightResponse).substring(0, 500),
      });

      throw new Error(`Invalid response structure: ${(error as Error).message}`);
    }

    // Subtask 5.3: Generate unique analysisId and create AnalysisRecord
    const analysisId = randomUUID();
    const createdAt = new Date().toISOString();
    const messageIds = messages.map(msg => msg.messageId);

    const analysisRecord: AnalysisRecord = {
      analysisId,
      jobId,
      userId,
      analysisType: 'insights',
      createdAt,
      messageIds,
      decisions: insightResponse.decisions,
      risks: insightResponse.risks,
      tasks: insightResponse.tasks,
      deadlines: insightResponse.deadlines,
    };

    console.log('Analysis record created', {
      analysisId,
      jobId,
      userId,
      messageIdsCount: messageIds.length,
    });

    // Subtask 5.3: Store record in Analysis table
    await storeAnalysisResult(analysisRecord, userId);

    console.log('Message analysis completed successfully', {
      analysisId,
      jobId,
      userId,
    });
  } catch (error) {
    // Top-level error handler
    console.error('Message Analyzer execution failed', {
      jobId,
      userId,
      error: (error as Error).message,
      errorStack: (error as Error).stack,
    });

    throw error;
  }
}

/**
 * Store analysis result in DynamoDB Analysis table
 * Subtask 5.3 & 5.4: Store record with error handling
 */
async function storeAnalysisResult(
  record: AnalysisRecord,
  userId: string
): Promise<void> {
  try {
    const command = new PutCommand({
      TableName: ANALYSIS_TABLE_NAME,
      Item: record,
    });

    await docClient.send(command);

    console.log('Analysis result stored successfully', {
      analysisId: record.analysisId,
      jobId: record.jobId,
      userId: record.userId,
    });
  } catch (error) {
    // Subtask 5.4: Handle DynamoDB storage failures
    console.error('Failed to store analysis result', {
      analysisId: record.analysisId,
      jobId: record.jobId,
      userId: record.userId,
      error: (error as Error).message,
      errorStack: (error as Error).stack,
    });

    throw new Error(`Failed to store analysis: ${(error as Error).message}`);
  }
}

/**
 * Validate insight extraction response structure
 * Ensures response has all required fields with correct types
 */
function validateInsightResponse(response: any): void {
  if (!response || typeof response !== 'object') {
    throw new Error('Response is not an object');
  }

  // Check required arrays
  const requiredArrays = ['decisions', 'risks', 'tasks', 'deadlines'];
  for (const field of requiredArrays) {
    if (!Array.isArray(response[field])) {
      throw new Error(`Missing or invalid field: ${field}`);
    }
  }

  // Validate task priorities
  const validPriorities = ['high', 'medium', 'low'];
  for (const task of response.tasks) {
    if (!validPriorities.includes(task.priority)) {
      throw new Error(
        `Invalid task priority: ${task.priority}. Must be one of: ${validPriorities.join(', ')}`
      );
    }
  }

  // Validate risk severities
  const validSeverities = ['critical', 'high', 'medium', 'low'];
  for (const risk of response.risks) {
    if (!validSeverities.includes(risk.severity)) {
      throw new Error(
        `Invalid risk severity: ${risk.severity}. Must be one of: ${validSeverities.join(', ')}`
      );
    }
  }
}

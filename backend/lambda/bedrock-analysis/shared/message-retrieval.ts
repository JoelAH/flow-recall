/**
 * Message retrieval utilities for Bedrock analysis
 * Retrieves messages from DynamoDB Messages table for analysis
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Message record interface matching the Messages table schema
 */
export interface MessageRecord {
  messageId: string;
  jobId: string;
  source: 'gmail' | 'slack';
  subject: string;
  text: string;
  timestamp: string;
  createdAt: string;
  sender: string;
  recipient: string;
  deduplicationHash: string;
}

/**
 * Configuration for message retrieval
 */
export interface MessageRetrievalConfig {
  tableName: string;
  region?: string;
}

/**
 * Retrieves messages from DynamoDB Messages table by jobId
 * Uses JobIdTimestampIndex GSI for chronological ordering
 * 
 * @param jobId - The job ID to query messages for
 * @param config - Configuration including table name and region
 * @returns Array of MessageRecord objects, empty array if no messages found
 * @throws Error if DynamoDB query fails
 */
export async function retrieveMessages(
  jobId: string,
  config: MessageRetrievalConfig
): Promise<MessageRecord[]> {
  const client = new DynamoDBClient({ region: config.region || process.env.AWS_REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  try {
    console.log('Retrieving messages from DynamoDB', {
      jobId,
      tableName: config.tableName,
      indexName: 'JobIdTimestampIndex',
    });

    const command = new QueryCommand({
      TableName: config.tableName,
      IndexName: 'JobIdTimestampIndex',
      KeyConditionExpression: 'jobId = :jobId',
      ExpressionAttributeValues: {
        ':jobId': jobId,
      },
      // Sort by timestamp ascending for chronological order
      ScanIndexForward: true,
    });

    const response = await docClient.send(command);

    // Return empty array if no messages found (not an error)
    if (!response.Items || response.Items.length === 0) {
      console.log('No messages found for jobId', { jobId });
      return [];
    }

    // Map DynamoDB items to MessageRecord interface
    const messages = response.Items.map(item => ({
      messageId: item.messageId as string,
      jobId: item.jobId as string,
      source: item.source as 'gmail' | 'slack',
      subject: item.subject as string,
      text: item.text as string,
      timestamp: item.timestamp as string,
      createdAt: item.createdAt as string,
      sender: item.sender as string,
      recipient: item.recipient as string,
      deduplicationHash: item.deduplicationHash as string,
    }));

    console.log('Successfully retrieved messages', {
      jobId,
      messageCount: messages.length,
    });

    return messages;
  } catch (error) {
    // Log error with jobId context
    console.error('Message retrieval failed', {
      jobId,
      tableName: config.tableName,
      error: (error as Error).message,
      errorStack: (error as Error).stack,
    });

    // Throw descriptive error with retrieval failure message
    throw new Error(`Failed to retrieve messages for jobId ${jobId}: ${(error as Error).message}`);
  }
}

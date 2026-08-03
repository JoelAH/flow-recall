/**
 * Message deduplication utilities for data ingestion pipeline
 * Handles deduplication checks and batch storage of messages
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { NormalizedMessage } from './normalization';

// Create default client (can be overridden in tests)
let docClient: DynamoDBDocumentClient;

/**
 * Initialize the DynamoDB document client
 * Exported for testing purposes
 */
export function initializeClient(client?: DynamoDBDocumentClient) {
  if (client) {
    docClient = client;
  } else {
    const ddbClient = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(ddbClient);
  }
}

// Initialize with default client
initializeClient();

export interface DeduplicationResult {
  storedCount: number;
  duplicateCount: number;
}

/**
 * Checks if a deduplication hash already exists for a given job
 * Uses the JobIdDeduplicationHashIndex GSI for efficient lookup
 * 
 * @param jobId - The job ID to check within
 * @param deduplicationHash - The hash to check for
 * @param tableName - The Messages table name
 * @returns true if the hash exists (duplicate), false otherwise
 */
export async function isDuplicate(
  jobId: string,
  deduplicationHash: string,
  tableName: string
): Promise<boolean> {
  const command = new QueryCommand({
    TableName: tableName,
    IndexName: 'JobIdDeduplicationHashIndex',
    KeyConditionExpression: 'jobId = :jobId AND deduplicationHash = :hash',
    ExpressionAttributeValues: {
      ':jobId': jobId,
      ':hash': deduplicationHash,
    },
    ProjectionExpression: 'messageId', // Only need to know if it exists
    Limit: 1, // We only need to know if at least one exists
  });

  const response = await docClient.send(command);
  return (response.Items?.length ?? 0) > 0;
}

/**
 * Batch checks multiple deduplication hashes for a given job
 * More efficient than checking each hash individually
 * Processes queries in parallel batches to avoid overwhelming the system
 * 
 * @param jobId - The job ID to check within
 * @param hashes - Array of deduplication hashes to check
 * @param tableName - The Messages table name
 * @returns Set of hashes that already exist in the database
 */
async function getExistingHashes(
  jobId: string,
  hashes: string[],
  tableName: string
): Promise<Set<string>> {
  if (hashes.length === 0) {
    return new Set();
  }

  const existingHashes = new Set<string>();

  // Query for each unique hash (DynamoDB doesn't support batch queries on GSI)
  // But we deduplicate the hash list first to minimize queries
  const uniqueHashes = [...new Set(hashes)];
  
  // Process in batches of 10 to avoid overwhelming the system
  const batchSize = 10;
  for (let i = 0; i < uniqueHashes.length; i += batchSize) {
    const batch = uniqueHashes.slice(i, i + batchSize);
    const queryPromises = batch.map(async (hash) => {
      const exists = await isDuplicate(jobId, hash, tableName);
      if (exists) {
        existingHashes.add(hash);
      }
    });
    await Promise.all(queryPromises);
  }

  return existingHashes;
}

/**
 * Stores messages in DynamoDB with deduplication
 * Checks each message against existing hashes in the job and only stores unique messages
 * Uses BatchWriteItem for efficient storage
 * 
 * @param messages - Array of normalized messages to store
 * @param tableName - The Messages table name
 * @returns DeduplicationResult with counts of stored and duplicate messages
 */
export async function storeMessagesWithDeduplication(
  messages: NormalizedMessage[],
  tableName: string
): Promise<DeduplicationResult> {
  if (messages.length === 0) {
    return { storedCount: 0, duplicateCount: 0 };
  }

  const jobId = messages[0].jobId;
  const uniqueMessages: NormalizedMessage[] = [];
  const seenHashes = new Set<string>();
  let duplicateCount = 0;

  // Collect all unique hashes from the batch
  const hashesToCheck: string[] = [];
  for (const message of messages) {
    if (!seenHashes.has(message.deduplicationHash)) {
      hashesToCheck.push(message.deduplicationHash);
      seenHashes.add(message.deduplicationHash);
    }
  }

  // Batch check all hashes against DynamoDB in parallel
  const existingHashes = await getExistingHashes(jobId, hashesToCheck, tableName);

  // Reset seenHashes for second pass
  seenHashes.clear();

  // Second pass: filter out duplicates
  for (const message of messages) {
    // Skip if we've already seen this hash in the current batch
    if (seenHashes.has(message.deduplicationHash)) {
      duplicateCount++;
      continue;
    }

    // Check if hash exists in DynamoDB
    if (existingHashes.has(message.deduplicationHash)) {
      duplicateCount++;
    } else {
      uniqueMessages.push(message);
      seenHashes.add(message.deduplicationHash);
    }
  }

  // Store unique messages in batches of 25 (DynamoDB BatchWriteItem limit)
  const batchSize = 25;
  for (let i = 0; i < uniqueMessages.length; i += batchSize) {
    const batch = uniqueMessages.slice(i, i + batchSize);
    
    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: batch.map(message => ({
          PutRequest: {
            Item: message,
          },
        })),
      },
    });

    await docClient.send(command);
  }

  return {
    storedCount: uniqueMessages.length,
    duplicateCount,
  };
}

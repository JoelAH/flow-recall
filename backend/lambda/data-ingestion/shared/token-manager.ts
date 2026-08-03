/**
 * Token Manager for Data Ingestion Pipeline
 * 
 * Handles OAuth token retrieval and decryption for Gmail and Slack integrations.
 * Used by Process Job Lambda to fetch messages from external APIs.
 */

import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GmailIntegration, SlackIntegration, UserRecord } from '../../../lib/types/user-record';

// Environment variables
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const KMS_KEY_ID = process.env.KMS_KEY_ID!;

// Initialize AWS clients
const kmsClient = new KMSClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Decrypted OAuth tokens for Gmail
 */
export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  connectedEmail: string;
}

/**
 * Decrypted OAuth tokens for Slack
 */
export interface SlackTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  workspaceName: string;
  workspaceId: string;
  userId: string;
}

/**
 * Combined OAuth tokens for both Gmail and Slack
 */
export interface UserOAuthTokens {
  gmail?: GmailTokens;
  slack?: SlackTokens;
}

/**
 * Retrieves user record from DynamoDB by cognitoUserId (using GSI)
 * 
 * @param cognitoUserId - Cognito user ID (from JWT sub claim)
 * @returns User record or null if not found
 */
async function getUserByCognitoId(cognitoUserId: string): Promise<UserRecord | null> {
  try {
    const command = new QueryCommand({
      TableName: USERS_TABLE_NAME,
      IndexName: 'cognitoUserIdIndex',
      KeyConditionExpression: 'cognitoUserId = :cognitoUserId',
      ExpressionAttributeValues: {
        ':cognitoUserId': cognitoUserId,
      },
      Limit: 1,
    });

    const response = await dynamoClient.send(command);
    
    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    return response.Items[0] as UserRecord;
  } catch (error) {
    console.error('Error retrieving user from the DynamoDB by cognitoUserId', {
      cognitoUserId,
      error: (error as Error).message,
    });
    throw new Error(`Failed to retrieve user: ${(error as Error).message}`);
  }
}

/**
 * Retrieves user record from DynamoDB by internalUserId
 * 
 * @param internalUserId - Internal user ID (partition key)
 * @returns User record or null if not found
 */
async function getUserByInternalId(internalUserId: string): Promise<UserRecord | null> {
  try {
    const command = new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        internalUserId,
      },
    });

    const response = await dynamoClient.send(command);
    
    if (!response.Item) {
      return null;
    }

    return response.Item as UserRecord;
  } catch (error) {
    console.error('Error retrieving user from DynamoDB', {
      internalUserId,
      error: (error as Error).message,
    });
    throw new Error(`Failed to retrieve user: ${(error as Error).message}`);
  }
}

/**
 * Decrypts a token using AWS KMS
 * 
 * @param encryptedToken - Base64-encoded encrypted token
 * @returns Decrypted plaintext token
 */
async function decryptToken(encryptedToken: string): Promise<string> {
  try {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(encryptedToken, 'base64'),
      KeyId: KMS_KEY_ID,
    });

    const response = await kmsClient.send(command);
    
    if (!response.Plaintext) {
      throw new Error('KMS decryption returned no plaintext');
    }

    return Buffer.from(response.Plaintext).toString('utf-8');
  } catch (error) {
    console.error('Error decrypting token with KMS', {
      error: (error as Error).message,
    });
    throw new Error(`KMS decryption failed: ${(error as Error).message}`);
  }
}

/**
 * Retrieves and decrypts OAuth tokens for a user by Cognito user ID
 * 
 * @param cognitoUserId - Cognito user ID (from JWT sub claim)
 * @returns Decrypted OAuth tokens for Gmail and Slack
 * @throws Error if user not found or tokens missing
 */
export async function getUserOAuthTokens(cognitoUserId: string): Promise<UserOAuthTokens> {
  // Retrieve user record by cognitoUserId
  const user = await getUserByCognitoId(cognitoUserId);
  
  if (!user) {
    throw new Error(`User not found`);
  }

  const tokens: UserOAuthTokens = {};

  // Process Gmail tokens if present
  if (user.gmailIntegration) {
    const gmailIntegration = user.gmailIntegration as GmailIntegration;
    
    if (gmailIntegration.status !== 'connected') {
      console.warn('Gmail integration not connected', {
        cognitoUserId,
        status: gmailIntegration.status,
      });
    } else if (!gmailIntegration.encryptedAccessToken || !gmailIntegration.encryptedRefreshToken) {
      console.warn('Gmail tokens missing', { cognitoUserId });
    } else {
      try {
        const accessToken = await decryptToken(gmailIntegration.encryptedAccessToken);
        const refreshToken = await decryptToken(gmailIntegration.encryptedRefreshToken);
        
        tokens.gmail = {
          accessToken,
          refreshToken,
          expiresAt: gmailIntegration.tokenExpiresAt || 0,
          connectedEmail: gmailIntegration.connectedEmail || '',
        };
      } catch (error) {
        console.error('Failed to decrypt Gmail tokens', {
          cognitoUserId,
          error: (error as Error).message,
        });
        throw new Error(`Failed to decrypt Gmail tokens: ${(error as Error).message}`);
      }
    }
  }

  // Process Slack tokens if present
  if (user.slackIntegration) {
    const slackIntegration = user.slackIntegration as SlackIntegration;
    
    if (!slackIntegration.encryptedAccessToken || !slackIntegration.encryptedRefreshToken) {
      console.warn('Slack tokens missing', { cognitoUserId });
    } else {
      try {
        const accessToken = await decryptToken(slackIntegration.encryptedAccessToken);
        const refreshToken = await decryptToken(slackIntegration.encryptedRefreshToken);
        
        tokens.slack = {
          accessToken,
          refreshToken,
          expiresAt: slackIntegration.expiresAt || 0,
          workspaceName: slackIntegration.workspaceName,
          workspaceId: slackIntegration.workspaceId,
          userId: slackIntegration.userId,
        };
      } catch (error) {
        console.error('Failed to decrypt Slack tokens', {
          cognitoUserId,
          error: (error as Error).message,
        });
        throw new Error(`Failed to decrypt Slack tokens: ${(error as Error).message}`);
      }
    }
  }

  // Validate that at least one set of tokens was retrieved
  if (!tokens.gmail && !tokens.slack) {
    throw new Error(`No OAuth tokens found for user`);
  }

  return tokens;
}

/**
 * Retrieves and decrypts Gmail OAuth tokens for a user by Cognito user ID
 * 
 * @param cognitoUserId - Cognito user ID (from JWT sub claim)
 * @returns Decrypted Gmail OAuth tokens
 * @throws Error if user not found or Gmail tokens missing
 */
export async function getGmailTokens(cognitoUserId: string): Promise<GmailTokens> {
  const tokens = await getUserOAuthTokens(cognitoUserId);
  
  if (!tokens.gmail) {
    throw new Error(`Gmail OAuth tokens not found for user`);
  }
  
  return tokens.gmail;
}

/**
 * Retrieves and decrypts Slack OAuth tokens for a user by Cognito user ID
 * 
 * @param cognitoUserId - Cognito user ID (from JWT sub claim)
 * @returns Decrypted Slack OAuth tokens
 * @throws Error if user not found or Slack tokens missing
 */
export async function getSlackTokens(cognitoUserId: string): Promise<SlackTokens> {
  const tokens = await getUserOAuthTokens(cognitoUserId);
  
  if (!tokens.slack) {
    throw new Error(`Slack OAuth tokens not found for user`);
  }
  
  return tokens.slack;
}

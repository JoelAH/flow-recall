import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SlackIntegration } from '../../lib/types/user-record';
import { createLogger, Logger } from './logger';
import { getUserByCognitoId, updateUserByCognitoId } from './dynamodb-helper';

/**
 * Token Manager
 * 
 * Handles OAuth token encryption, storage, retrieval, refresh, and deletion
 * using AWS KMS for encryption and DynamoDB for storage.
 * 
 * Security Features:
 * - All tokens encrypted at rest using AWS KMS
 * - Automatic token refresh before expiration
 * - Retry logic with exponential backoff for transient failures
 * - Never logs unencrypted tokens (only last 4 characters for debugging)
 */

// Environment variables
const KMS_KEY_ID = process.env.KMS_KEY_ID!;
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

// Initialize AWS clients
const kmsClient = new KMSClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Retry configuration
const RETRY_CONFIG = {
  initialDelayMs: 100,
  multiplier: 2,
  maxDelayMs: 1000,
  jitterPercent: 25,
  maxAttempts: 3,
};

/**
 * Token data structure returned by getTokens and refreshTokens
 */
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  workspaceName: string;
  workspaceId: string;
  userId: string;
}

/**
 * Slack OAuth token response structure
 */
interface SlackTokenResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    name: string;
    id: string;
  };
  enterprise?: {
    name: string;
    id: string;
  };
  authed_user?: {
    id: string;
    scope: string;
    access_token: string;
    token_type: string;
  };
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

/**
 * TokenManager class
 * 
 * Provides methods for managing OAuth tokens with KMS encryption
 */
export class TokenManager {
  private logger: Logger;

  constructor() {
    this.logger = createLogger();
  }

  /**
   * Encrypt a token using AWS KMS
   * 
   * @param token - The plaintext token to encrypt
   * @returns Base64-encoded encrypted token
   */
  async encryptToken(token: string): Promise<string> {
    const tokenLastChars = Logger.getTokenLastChars(token);
    
    return this.retryWithBackoff(async () => {
      try {
        const command = new EncryptCommand({
          KeyId: KMS_KEY_ID,
          Plaintext: Buffer.from(token, 'utf-8'),
        });

        const response = await kmsClient.send(command);
        
        if (!response.CiphertextBlob) {
          throw new Error('KMS encryption returned no ciphertext');
        }

        const encrypted = Buffer.from(response.CiphertextBlob).toString('base64');
        this.logger.logTokenEncrypt(tokenLastChars, true);
        
        return encrypted;
      } catch (error) {
        this.logger.logTokenEncrypt(tokenLastChars, false, error as Error);
        throw error;
      }
    }, 'encryptToken');
  }

  /**
   * Decrypt a token using AWS KMS
   * 
   * @param encryptedToken - Base64-encoded encrypted token
   * @returns Decrypted plaintext token
   */
  async decryptToken(encryptedToken: string): Promise<string> {
    return this.retryWithBackoff(async () => {
      try {
        const command = new DecryptCommand({
          CiphertextBlob: Buffer.from(encryptedToken, 'base64'),
          KeyId: KMS_KEY_ID,
        });

        const response = await kmsClient.send(command);
        
        if (!response.Plaintext) {
          throw new Error('KMS decryption returned no plaintext');
        }

        const decrypted = Buffer.from(response.Plaintext).toString('utf-8');
        const tokenLastChars = Logger.getTokenLastChars(decrypted);
        this.logger.logTokenDecrypt(tokenLastChars, true);
        
        return decrypted;
      } catch (error) {
        this.logger.logTokenDecrypt('unknown', false, error as Error);
        throw error;
      }
    }, 'decryptToken');
  }

  /**
   * Store OAuth tokens in DynamoDB with encryption
   * 
   * @param userId - Cognito user ID
   * @param accessToken - OAuth access token
   * @param refreshToken - OAuth refresh token
   * @param expiresIn - Token expiration time in seconds
   * @param workspaceName - Slack workspace name
   * @param workspaceId - Slack workspace ID
   * @param slackUserId - Slack user ID
   */
  async storeTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    workspaceName: string,
    workspaceId: string,
    slackUserId: string
  ): Promise<void> {
    this.logger.info('Storing tokens', { userId, workspaceName });

    try {
      // First verify user exists
      const user = await getUserByCognitoId(dynamoClient, userId);
      if (!user) {
        throw new Error(`User not found for cognitoUserId: ${userId}`);
      }

      // Encrypt both tokens
      const encryptedAccessToken = await this.encryptToken(accessToken);
      const encryptedRefreshToken = await this.encryptToken(refreshToken);

      // Calculate expiration timestamp (current time + expiresIn seconds)
      const expiresAt = Date.now() + (expiresIn * 1000);
      const now = new Date().toISOString();

      // Update DynamoDB with encrypted tokens
      await this.retryWithBackoff(
        async () => updateUserByCognitoId(
          dynamoClient,
          userId,
          'SET slackIntegration = :integration, updated = :updated',
          undefined,
          {
            ':integration': {
              encryptedAccessToken,
              encryptedRefreshToken,
              workspaceName,
              workspaceId,
              userId: slackUserId,
              connectedAt: now,
              expiresAt,
            } as SlackIntegration,
            ':updated': now,
          }
        ),
        'storeTokens'
      );

      this.logger.logTokenStore(userId, true);
    } catch (error) {
      this.logger.logTokenStore(userId, false, error as Error);
      throw error;
    }
  }

  /**
   * Delete and revoke OAuth tokens
   * 
   * @param userId - Cognito user ID
   */
  async deleteTokens(userId: string): Promise<void> {
    this.logger.info('Deleting tokens', { userId });

    try {
      // Retrieve tokens from DynamoDB
      const user = await getUserByCognitoId(dynamoClient, userId);

      if (user?.slackIntegration?.encryptedAccessToken) {
        // Decrypt access token for revocation
        const accessToken = await this.decryptToken(
          user.slackIntegration.encryptedAccessToken
        );

        // Attempt to revoke token with Slack
        try {
          const revokeResponse = await fetch(
            'https://slack.com/api/auth.revoke',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            }
          );

          if (!revokeResponse.ok) {
            this.logger.warn('Token revocation failed, continuing with deletion', {
              userId,
              statusCode: revokeResponse.status,
            });
          } else {
            const revokeData = await revokeResponse.json() as { ok?: boolean; error?: string };
            if (revokeData.ok) {
              this.logger.info('Token revoked successfully', { userId });
            } else {
              this.logger.warn('Token revocation returned error, continuing with deletion', {
                userId,
                error: revokeData.error,
              });
            }
          }
        } catch (revokeError) {
          this.logger.warn('Error revoking token, continuing with deletion', {
            userId,
            error: (revokeError as Error).message,
          });
        }
      }

      // Remove tokens from DynamoDB regardless of revocation result
      await this.retryWithBackoff(
        async () => updateUserByCognitoId(
          dynamoClient,
          userId,
          'REMOVE slackIntegration SET updated = :updated',
          undefined,
          {
            ':updated': new Date().toISOString(),
          }
        ),
        'deleteTokens'
      );

      this.logger.logTokenDelete(userId, true);
    } catch (error) {
      this.logger.logTokenDelete(userId, false, error as Error);
      throw error;
    }
  }

  /**
   * Retrieve OAuth tokens from DynamoDB with decryption
   * Automatically refreshes tokens if expired
   * 
   * @param userId - Cognito user ID
   * @returns Token data with decrypted tokens
   */
  async getTokens(userId: string): Promise<TokenData> {
    this.logger.info('Retrieving tokens', { userId });

    try {
      // Retrieve user record from DynamoDB
      const user = await this.retryWithBackoff(
        async () => getUserByCognitoId(dynamoClient, userId),
        'getTokens'
      );

      if (!user || !user.slackIntegration) {
        throw new Error('No Slack integration found for user');
      }

      const integration = user.slackIntegration;

      if (!integration.encryptedAccessToken || !integration.encryptedRefreshToken) {
        throw new Error('Missing encrypted tokens in database');
      }

      // Decrypt tokens
      const accessToken = await this.decryptToken(integration.encryptedAccessToken);
      const refreshToken = await this.decryptToken(integration.encryptedRefreshToken);

      // Check if token is expired or about to expire (within 5 minutes)
      const now = Date.now();
      const expiresAt = integration.expiresAt || 0;
      const bufferMs = 5 * 60 * 1000; // 5 minutes

      if (now + bufferMs >= expiresAt) {
        this.logger.info('Token expired or expiring soon, refreshing', { userId });
        return this.refreshTokens(userId, refreshToken, integration);
      }

      this.logger.logTokenRetrieve(userId, true);

      return {
        accessToken,
        refreshToken,
        expiresAt,
        workspaceName: integration.workspaceName,
        workspaceId: integration.workspaceId,
        userId: integration.userId,
      };
    } catch (error) {
      this.logger.logTokenRetrieve(userId, false, error as Error);
      throw error;
    }
  }

  /**
   * Refresh OAuth tokens using the refresh token
   * 
   * @param userId - Cognito user ID
   * @param refreshToken - Current refresh token
   * @param currentIntegration - Current integration data
   * @returns New token data with refreshed access token
   */
  async refreshTokens(
    userId: string,
    refreshToken: string,
    currentIntegration: SlackIntegration
  ): Promise<TokenData> {
    this.logger.info('Refreshing tokens', { userId });

    try {
      // Call Slack OAuth token refresh endpoint
      const response = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: SLACK_CLIENT_ID,
          client_secret: SLACK_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json() as SlackTokenResponse;

      if (!tokenData.ok) {
        // Handle invalid_grant or other errors
        if (tokenData.error === 'invalid_grant' || tokenData.error === 'invalid_refresh_token') {
          this.logger.error('Refresh token invalid, removing integration', { userId });
          await this.deleteTokens(userId);
          throw new Error('Refresh token invalid, integration removed');
        }
        throw new Error(`Token refresh failed: ${tokenData.error}`);
      }

      // Extract the user access token (not the bot token)
      const newAccessToken = tokenData.authed_user?.access_token || tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token || refreshToken;
      const expiresIn = tokenData.expires_in || 43200; // Default 12 hours if not provided

      // Encrypt and store new tokens
      const encryptedAccessToken = await this.encryptToken(newAccessToken);
      const encryptedRefreshToken = await this.encryptToken(newRefreshToken);
      const expiresAt = Date.now() + (expiresIn * 1000);
      const now = new Date().toISOString();

      // Update DynamoDB with new tokens and expiration
      await this.retryWithBackoff(
        async () => updateUserByCognitoId(
          dynamoClient,
          userId,
          'SET slackIntegration.encryptedAccessToken = :accessToken, slackIntegration.encryptedRefreshToken = :refreshToken, slackIntegration.expiresAt = :expiresAt, updated = :updated',
          undefined,
          {
            ':accessToken': encryptedAccessToken,
            ':refreshToken': encryptedRefreshToken,
            ':expiresAt': expiresAt,
            ':updated': now,
          }
        ),
        'refreshTokens'
      );

      this.logger.logTokenRefresh(userId, true);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt,
        workspaceName: currentIntegration.workspaceName,
        workspaceId: currentIntegration.workspaceId,
        userId: currentIntegration.userId,
      };
    } catch (error) {
      this.logger.logTokenRefresh(userId, false, error as Error);
      throw error;
    }
  }

  /**
   * Retry a function with exponential backoff
   * 
   * @param fn - Function to retry
   * @param operationName - Name of operation for logging
   * @returns Result of the function
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === RETRY_CONFIG.maxAttempts) {
          this.logger.error(`${operationName} failed after ${RETRY_CONFIG.maxAttempts} attempts`, {
            operation: operationName,
            error: lastError.message,
            errorDetails: lastError.stack,
          });
          break;
        }

        // Calculate jitter (±25%)
        const jitter = delay * (RETRY_CONFIG.jitterPercent / 100);
        const jitterAmount = (Math.random() * 2 - 1) * jitter;
        const delayWithJitter = Math.max(0, delay + jitterAmount);

        this.logger.warn(`${operationName} failed, retrying`, {
          operation: operationName,
          attempt,
          maxAttempts: RETRY_CONFIG.maxAttempts,
          retryDelayMs: Math.round(delayWithJitter),
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delayWithJitter));

        // Exponential backoff with max delay cap
        delay = Math.min(delay * RETRY_CONFIG.multiplier, RETRY_CONFIG.maxDelayMs);
      }
    }

    throw lastError;
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();

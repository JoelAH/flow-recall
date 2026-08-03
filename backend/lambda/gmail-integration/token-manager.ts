import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GmailIntegration } from '../../lib/types/user-record';
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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

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
  email: string;
}

/**
 * Google OAuth token response structure
 */
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
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
   * @param email - Connected Gmail email address
   */
  async storeTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    email: string
  ): Promise<void> {
    this.logger.info('Storing tokens', { userId, email });

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
      const tokenExpiresAt = Date.now() + (expiresIn * 1000);
      const now = new Date().toISOString();

      // Update DynamoDB with encrypted tokens
      await this.retryWithBackoff(
        async () => updateUserByCognitoId(
          dynamoClient,
          userId,
          'SET gmailIntegration = :integration, updated = :updated',
          undefined,
          {
            ':integration': {
              status: 'connected',
              encryptedAccessToken,
              encryptedRefreshToken,
              tokenExpiresAt,
              connectedEmail: email,
              connectedAt: now,
              lastRefreshedAt: now,
            } as GmailIntegration,
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

      if (!user || !user.gmailIntegration) {
        throw new Error('No Gmail integration found for user');
      }

      const integration = user.gmailIntegration as GmailIntegration;

      if (integration.status !== 'connected') {
        throw new Error(`Gmail integration status is ${integration.status}`);
      }

      if (!integration.encryptedAccessToken || !integration.encryptedRefreshToken) {
        throw new Error('Missing encrypted tokens in database');
      }

      // Decrypt tokens
      const accessToken = await this.decryptToken(integration.encryptedAccessToken);
      const refreshToken = await this.decryptToken(integration.encryptedRefreshToken);

      // Check if token is expired or about to expire (within 5 minutes)
      const now = Date.now();
      const expiresAt = integration.tokenExpiresAt || 0;
      const bufferMs = 5 * 60 * 1000; // 5 minutes

      if (now + bufferMs >= expiresAt) {
        this.logger.info('Token expired or expiring soon, refreshing', { userId });
        return this.refreshTokens(userId, refreshToken);
      }

      this.logger.logTokenRetrieve(userId, true);

      return {
        accessToken,
        refreshToken,
        expiresAt,
        email: integration.connectedEmail || '',
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
   * @returns New token data with refreshed access token
   */
  async refreshTokens(userId: string, refreshToken: string): Promise<TokenData> {
    this.logger.info('Refreshing tokens', { userId });

    try {
      // Call Google OAuth token refresh endpoint
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        
        // Handle invalid_grant error (refresh token expired/revoked)
        if (errorData.error === 'invalid_grant') {
          this.logger.error('Refresh token invalid, marking disconnected', { userId });
          await this.markDisconnected(userId, 'Refresh token expired or revoked');
          throw new Error('Refresh token invalid, integration marked as disconnected');
        }

        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json() as GoogleTokenResponse;

      // Encrypt and store new access token
      const encryptedAccessToken = await this.encryptToken(tokenData.access_token);
      const tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);
      const now = new Date().toISOString();

      // Update DynamoDB with new access token and expiration
      await this.retryWithBackoff(
        async () => updateUserByCognitoId(
          dynamoClient,
          userId,
          'SET gmailIntegration.encryptedAccessToken = :accessToken, gmailIntegration.tokenExpiresAt = :expiresAt, gmailIntegration.lastRefreshedAt = :refreshedAt, updated = :updated',
          undefined,
          {
            ':accessToken': encryptedAccessToken,
            ':expiresAt': tokenExpiresAt,
            ':refreshedAt': now,
            ':updated': now,
          }
        ),
        'refreshTokens'
      );

      this.logger.logTokenRefresh(userId, true);

      // Get the connected email from the database
      const userRecord = await getUserByCognitoId(dynamoClient, userId);
      const email = userRecord?.gmailIntegration?.connectedEmail || '';

      return {
        accessToken: tokenData.access_token,
        refreshToken, // Refresh token doesn't change
        expiresAt: tokenExpiresAt,
        email,
      };
    } catch (error) {
      this.logger.logTokenRefresh(userId, false, error as Error);
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

      if (user?.gmailIntegration?.encryptedAccessToken) {
        // Decrypt access token for revocation
        const accessToken = await this.decryptToken(
          user.gmailIntegration.encryptedAccessToken
        );

        // Attempt to revoke token with Google
        try {
          const revokeResponse = await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
            { method: 'POST' }
          );

          if (!revokeResponse.ok) {
            this.logger.warn('Token revocation failed, continuing with deletion', {
              userId,
              statusCode: revokeResponse.status,
            });
          } else {
            this.logger.info('Token revoked successfully', { userId });
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
          'SET gmailIntegration = :integration, updated = :updated',
          undefined,
          {
            ':integration': {
              status: 'disconnected',
            } as GmailIntegration,
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
   * Mark integration as disconnected with error message
   * 
   * @param userId - Cognito user ID
   * @param errorMessage - Error message to store
   */
  private async markDisconnected(userId: string, errorMessage: string): Promise<void> {
    await updateUserByCognitoId(
      dynamoClient,
      userId,
      'SET gmailIntegration = :integration, updated = :updated',
      undefined,
      {
        ':integration': {
          status: 'disconnected',
          errorMessage: errorMessage,
        } as GmailIntegration,
        ':updated': new Date().toISOString(),
      }
    );
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

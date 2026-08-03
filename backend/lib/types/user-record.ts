/**
 * Type definitions for DynamoDB Users table records
 * Includes Gmail integration OAuth token storage
 */

export interface GmailIntegration {
  status: 'connected' | 'disconnected' | 'error';
  encryptedAccessToken?: string;   // Base64-encoded KMS ciphertext
  encryptedRefreshToken?: string;  // Base64-encoded KMS ciphertext
  tokenExpiresAt?: number;         // Unix timestamp (milliseconds)
  connectedEmail?: string;         // Gmail address (e.g., user@gmail.com)
  connectedAt?: string;            // ISO 8601 timestamp
  lastRefreshedAt?: string;        // ISO 8601 timestamp
  errorMessage?: string;           // Last error message if status='error'
}

export interface SlackIntegration {
  encryptedAccessToken: string;    // Base64-encoded KMS ciphertext
  encryptedRefreshToken: string;   // Base64-encoded KMS ciphertext
  workspaceName: string;           // Human-readable workspace name
  workspaceId: string;             // Slack workspace ID (e.g., T1234567890)
  userId: string;                  // Slack user ID (e.g., U1234567890)
  connectedAt: string;             // ISO 8601 timestamp
  expiresAt: number;               // Unix timestamp (milliseconds)
}

export interface OAuthStateToken {
  createdAt: number;   // Unix timestamp (milliseconds)
  expiresAt: number;   // Unix timestamp (milliseconds)
}

export interface UserRecord {
  // Core user fields
  internalUserId: string;    // Partition key
  cognitoUserId: string;     // GSI partition key
  email: string;
  userRole: string;          // User role (e.g., 'ORG_OWNER')
  created: string;           // ISO 8601 timestamp
  updated: string;           // ISO 8601 timestamp
  
  // Gmail integration fields
  gmailIntegration?: GmailIntegration;
  
  // Slack integration fields
  slackIntegration?: SlackIntegration;
  
  // OAuth state tokens (temporary, for CSRF protection)
  // Map of state token string to token metadata
  oauthStateTokens?: Record<string, OAuthStateToken>;
}

/**
 * Helper type for creating new user records
 */
export type CreateUserRecord = Pick<UserRecord, 'internalUserId' | 'cognitoUserId' | 'email' | 'userRole' | 'created' | 'updated'>;

/**
 * Helper type for updating Gmail integration status
 */
export type UpdateGmailIntegration = Partial<GmailIntegration>;

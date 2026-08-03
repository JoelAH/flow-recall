import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { randomBytes } from 'crypto';
import { OAuthStateToken } from '../../lib/types/user-record';
import { createLogger } from './logger';
import { updateUserByCognitoId } from './dynamodb-helper';

/**
 * OAuth Initiation Handler
 * 
 * Handles the /authorize endpoint to initiate the Slack OAuth 2.0 flow.
 * Generates a secure state token for CSRF protection and returns the
 * Slack authorization URL.
 * 
 * Flow:
 * 1. Validate Cognito session from authorizer context
 * 2. Generate cryptographically secure state token (32 bytes)
 * 3. Store state token in DynamoDB with 5-minute TTL
 * 4. Build Slack OAuth URL with required scopes
 * 5. Return authorization URL to frontend
 */

// Environment variables
const SLACK_CLIENT_ID_PARAM = '/flowrecall/slack-oauth-client-id';
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const STATE_TOKEN_TTL = parseInt(process.env.STATE_TOKEN_TTL || '300', 10); // 5 minutes

/**
 * Construct OAuth redirect URI from API Gateway context
 * This avoids circular dependency in CDK by building the URI at runtime
 */
function getRedirectUri(event: APIGatewayProxyEvent): string {
  const apiId = event.requestContext.apiId;
  const stage = event.requestContext.stage;
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}/api/integrations/slack/callback`;
}

// Initialize AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

// Cache for SSM parameters
let cachedClientId: string | null = null;

/**
 * Fetch Slack Client ID from SSM Parameter Store
 */
async function getSlackClientId(): Promise<string> {
  if (cachedClientId) {
    return cachedClientId;
  }

  const command = new GetParameterCommand({
    Name: SLACK_CLIENT_ID_PARAM,
    WithDecryption: true,
  });

  const response = await ssmClient.send(command);
  
  if (!response.Parameter?.Value) {
    throw new Error('Slack Client ID not found in SSM Parameter Store');
  }
  
  cachedClientId = response.Parameter.Value;
  return cachedClientId;
}

// OAuth scopes required for Slack integration (user-level scopes)
const OAUTH_SCOPES = [
  'channels:history',
  'groups:history',
  'im:history',
  'mpim:history',
  'users:read',
  'team:read',
  'channels:read',
  'groups:read',
  'search:read', // Useful for searching messages
];

/**
 * Generate a cryptographically secure random state token
 * Encodes the user ID in the token for efficient lookup during callback
 * 
 * Format: base64url(userId):randomToken
 * This allows us to extract the user ID from the state token without table scan
 * 
 * @param cognitoUserId - User's Cognito ID to encode in token
 * @returns State token with encoded user ID
 */
function generateStateToken(cognitoUserId: string): string {
  const userIdEncoded = Buffer.from(cognitoUserId, 'utf-8').toString('base64url');
  const randomToken = randomBytes(32).toString('base64url');
  return `${userIdEncoded}:${randomToken}`;
}

/**
 * Store state token in DynamoDB with expiration
 * 
 * @param cognitoUserId - User's Cognito ID
 * @param stateToken - Generated state token
 */
async function storeStateToken(cognitoUserId: string, stateToken: string): Promise<void> {
  const now = Date.now();
  const expiresAt = now + (STATE_TOKEN_TTL * 1000);

  const tokenData: OAuthStateToken = {
    createdAt: now,
    expiresAt,
  };

  try {
    // Try to set the nested attribute directly
    await updateUserByCognitoId(
      dynamoClient,
      cognitoUserId,
      'SET #tokens.#state = :tokenData, updated = :updated',
      {
        '#tokens': 'oauthStateTokens',
        '#state': stateToken,
      },
      {
        ':tokenData': tokenData,
        ':updated': new Date().toISOString(),
      }
    );
  } catch (error: any) {
    // If the path doesn't exist, create the map first then retry
    if (error.name === 'ValidationException' && error.message.includes('document path')) {
      await updateUserByCognitoId(
        dynamoClient,
        cognitoUserId,
        'SET #tokens = :emptyMap, updated = :updated',
        {
          '#tokens': 'oauthStateTokens',
        },
        {
          ':emptyMap': {},
          ':updated': new Date().toISOString(),
        }
      );
      
      // Now set the token
      await updateUserByCognitoId(
        dynamoClient,
        cognitoUserId,
        'SET #tokens.#state = :tokenData, updated = :updated',
        {
          '#tokens': 'oauthStateTokens',
          '#state': stateToken,
        },
        {
          ':tokenData': tokenData,
          ':updated': new Date().toISOString(),
        }
      );
    } else {
      throw error;
    }
  }

  console.log(`State token stored for user ${cognitoUserId}, expires in ${STATE_TOKEN_TTL}s`);
}

/**
 * Build Slack OAuth authorization URL
 * 
 * @param stateToken - CSRF protection state token
 * @param clientId - Slack OAuth client ID
 * @param redirectUri - OAuth callback URI
 * @returns Complete authorization URL
 */
function buildAuthorizationUrl(stateToken: string, clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    user_scope: OAUTH_SCOPES.join(','), // User scopes use comma separator
    state: stateToken,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Lambda handler for OAuth initiation
 * 
 * @param event - API Gateway event with Cognito authorizer context
 * @returns Authorization URL for frontend to redirect to
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const logger = createLogger(event.requestContext.requestId);
  logger.info('OAuth initiation request received');

  try {
    // Extract Cognito user ID from authorizer context
    const cognitoUserId = event.requestContext.authorizer?.claims?.sub;

    if (!cognitoUserId) {
      logger.logAuthFailure('No Cognito user ID in authorizer context');
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'unauthorized',
          message: 'Invalid or expired session',
          retryable: false,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.info('Initiating OAuth flow', { userId: cognitoUserId });

    // Construct redirect URI from API Gateway context
    const redirectUri = getRedirectUri(event);

    // Fetch Slack Client ID from SSM
    const clientId = await getSlackClientId();

    // Generate cryptographically secure state token with encoded user ID
    const stateToken = generateStateToken(cognitoUserId);

    // Store state token in DynamoDB with expiration
    await storeStateToken(cognitoUserId, stateToken);
    console.log('redirect uri', redirectUri);
    // Build Slack OAuth authorization URL
    const authorizationUrl = buildAuthorizationUrl(stateToken, clientId, redirectUri);

    logger.logOAuthInitiation(cognitoUserId, true);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        authorizationUrl,
      }),
    };
  } catch (error) {
    const errorObj = error as Error;
    logger.logOAuthInitiation('unknown', false, errorObj);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'service_unavailable',
        message: 'Unable to initiate OAuth flow, please try again',
        retryable: true,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

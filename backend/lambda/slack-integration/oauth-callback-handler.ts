import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { tokenManager } from './token-manager';
import { OAuthStateToken } from '../../lib/types/user-record';
import { createLogger, Logger } from './logger';
import { getUserByCognitoId, updateUserByCognitoId } from './dynamodb-helper';

/**
 * OAuth Callback Handler
 * 
 * Handles the /callback endpoint to process Slack's OAuth 2.0 redirect.
 * Validates the state token, exchanges the authorization code for tokens,
 * and stores the encrypted tokens in DynamoDB.
 * 
 * Flow:
 * 1. Extract code, state, and error from query parameters
 * 2. Validate state token exists in DynamoDB and not expired
 * 3. Retrieve associated Cognito user ID from state token
 * 4. Handle user cancellation (error=access_denied)
 * 5. Exchange authorization code for tokens with Slack
 * 6. Retrieve workspace name and user's Slack identity
 * 7. Call TokenManager to encrypt and store tokens
 * 8. Delete used state token from DynamoDB
 * 9. Redirect to frontend with success or error status
 */

// Environment variables
const SLACK_CLIENT_ID_PARAM = '/flowrecall/slack-oauth-client-id';
const SLACK_CLIENT_SECRET_PARAM = '/flowrecall/slack-oauth-client-secret';
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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
let cachedClientSecret: string | null = null;

/**
 * Fetch Slack OAuth credentials from SSM Parameter Store
 */
async function getSlackCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  if (cachedClientId && cachedClientSecret) {
    return { clientId: cachedClientId, clientSecret: cachedClientSecret };
  }

  const [clientIdResponse, clientSecretResponse] = await Promise.all([
    ssmClient.send(new GetParameterCommand({
      Name: SLACK_CLIENT_ID_PARAM,
      WithDecryption: true,
    })),
    ssmClient.send(new GetParameterCommand({
      Name: SLACK_CLIENT_SECRET_PARAM,
      WithDecryption: true,
    })),
  ]);

  if (!clientIdResponse.Parameter?.Value || !clientSecretResponse.Parameter?.Value) {
    throw new Error('Slack OAuth credentials not found in SSM Parameter Store');
  }

  cachedClientId = clientIdResponse.Parameter.Value;
  cachedClientSecret = clientSecretResponse.Parameter.Value;

  return { clientId: cachedClientId, clientSecret: cachedClientSecret };
}

/**
 * Slack OAuth token response structure
 */
interface SlackTokenResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
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
    refresh_token?: string;
    expires_in?: number;
  };
  error?: string;
  error_description?: string;
}

/**
 * Validate state token from user record
 * 
 * @param cognitoUserId - User's Cognito ID
 * @param stateToken - State token to validate
 * @param logger - Logger instance
 * @returns True if valid and not expired
 */
async function validateStateTokenForUser(
  cognitoUserId: string,
  stateToken: string,
  logger: Logger
): Promise<boolean> {
  const user = await getUserByCognitoId(dynamoClient, cognitoUserId);

  if (!user?.oauthStateTokens?.[stateToken]) {
    logger.warn('State token not found for user', { userId: cognitoUserId });
    return false;
  }

  const tokenData = user.oauthStateTokens[stateToken] as OAuthStateToken;
  const now = Date.now();

  if (now > tokenData.expiresAt) {
    logger.logExpiredState(stateToken, cognitoUserId);
    return false;
  }

  logger.debug('State token validated successfully', { userId: cognitoUserId });
  return true;
}

/**
 * Delete used state token from DynamoDB
 * 
 * @param cognitoUserId - User's Cognito ID
 * @param stateToken - State token to delete
 * @param logger - Logger instance
 */
async function deleteStateToken(cognitoUserId: string, stateToken: string, logger: Logger): Promise<void> {
  await updateUserByCognitoId(
    dynamoClient,
    cognitoUserId,
    'REMOVE oauthStateTokens.#state SET updated = :updated',
    {
      '#state': stateToken,
    },
    {
      ':updated': new Date().toISOString(),
    }
  );

  logger.debug('State token deleted', { userId: cognitoUserId });
}

/**
 * Exchange authorization code for OAuth tokens
 * 
 * @param code - Authorization code from Slack
 * @param clientId - Slack OAuth client ID
 * @param clientSecret - Slack OAuth client secret
 * @param redirectUri - OAuth callback URI
 * @param logger - Logger instance
 * @returns Token response from Slack
 */
async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  logger: Logger
): Promise<SlackTokenResponse> {
  logger.debug('Exchanging authorization code for tokens');

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json() as SlackTokenResponse;

    if (!response.ok || !data.ok || data.error) {
      logger.logSlackAPIError('token_exchange', new Error(data.error_description || data.error || 'Token exchange failed'));
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    if (!data.authed_user?.access_token) {
      logger.error('No user access token received from Slack');
      throw new Error('No user access token received from Slack');
    }

    logger.debug('Token exchange successful');
    return data;
  } catch (error) {
    logger.logSlackAPIError('token_exchange', error as Error);
    throw error;
  }
}

/**
 * Build redirect URL for frontend
 * 
 * @param success - Whether OAuth flow succeeded
 * @param error - Error code if failed
 * @param message - Error message if failed
 * @returns Complete redirect URL
 */
function buildRedirectUrl(success: boolean, error?: string, message?: string): string {
  const params = new URLSearchParams();
  
  if (success) {
    params.set('slack', 'connected');
  } else {
    params.set('slack', 'error');
    if (error) params.set('error', error);
    if (message) params.set('message', message);
  }

  return `${FRONTEND_URL}/integrations?${params.toString()}`;
}

/**
 * Lambda handler for OAuth callback
 * 
 * @param event - API Gateway event with query parameters
 * @returns Redirect response to frontend
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const logger = createLogger(event.requestContext.requestId);
  logger.info('OAuth callback received');

  try {
    // Extract query parameters
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    const error = event.queryStringParameters?.error;

    // Handle user cancellation
    if (error === 'access_denied') {
      logger.logOAuthCancelled();
      return {
        statusCode: 302,
        headers: {
          Location: buildRedirectUrl(false, 'cancelled', 'Connection cancelled'),
        },
        body: '',
      };
    }

    // Validate required parameters
    if (!code || !state) {
      logger.error('Missing required OAuth callback parameters', {
        hasCode: !!code,
        hasState: !!state,
      });
      return {
        statusCode: 302,
        headers: {
          Location: buildRedirectUrl(false, 'invalid_request', 'Invalid OAuth callback'),
        },
        body: '',
      };
    }

    // Parse state token to extract user ID
    // Format: base64url(userId):randomToken
    const stateMatch = state.match(/^([^:]+):(.+)$/);
    
    if (!stateMatch) {
      logger.logInvalidState(state);
      return {
        statusCode: 302,
        headers: {
          Location: buildRedirectUrl(false, 'invalid_state', 'Invalid state token'),
        },
        body: '',
      };
    }

    const cognitoUserId = Buffer.from(stateMatch[1], 'base64url').toString('utf-8');
    const actualStateToken = state;

    logger.info('Processing OAuth callback', { userId: cognitoUserId });

    // Construct redirect URI from API Gateway context
    const redirectUri = getRedirectUri(event);

    // Validate state token
    const isValid = await validateStateTokenForUser(cognitoUserId, actualStateToken, logger);

    if (!isValid) {
      logger.logInvalidState(actualStateToken, cognitoUserId);
      return {
        statusCode: 302,
        headers: {
          Location: buildRedirectUrl(false, 'invalid_state', 'Invalid or expired state token'),
        },
        body: '',
      };
    }

    // Fetch Slack OAuth credentials from SSM
    const { clientId, clientSecret } = await getSlackCredentials();

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, logger);

    if (!tokenResponse.authed_user?.access_token) {
      throw new Error('No access token received from Slack');
    }

    // Extract user access token and refresh token
    const accessToken = tokenResponse.authed_user.access_token;
    const refreshToken = tokenResponse.authed_user.refresh_token || accessToken; // Fallback to access token if no refresh token
    const expiresIn = tokenResponse.authed_user.expires_in || 43200; // Default to 12 hours if not provided
    
    // Extract workspace information
    const workspaceName = tokenResponse.team?.name || 'Unknown Workspace';
    const workspaceId = tokenResponse.team?.id || '';
    const slackUserId = tokenResponse.authed_user.id;

    // Store encrypted tokens using TokenManager
    await tokenManager.storeTokens(
      cognitoUserId,
      accessToken,
      refreshToken,
      expiresIn,
      workspaceName,
      workspaceId,
      slackUserId
    );

    // Delete used state token
    await deleteStateToken(cognitoUserId, actualStateToken, logger);

    logger.logOAuthSuccess(cognitoUserId, workspaceName);

    // Redirect to frontend with success
    return {
      statusCode: 302,
      headers: {
        Location: buildRedirectUrl(true),
      },
      body: '',
    };
  } catch (error) {
    const errorObj = error as Error;
    logger.logOAuthCallback('unknown', false, errorObj);

    return {
      statusCode: 302,
      headers: {
        Location: buildRedirectUrl(
          false,
          'token_exchange_failed',
          'Failed to connect Slack workspace'
        ),
      },
      body: '',
    };
  }
}

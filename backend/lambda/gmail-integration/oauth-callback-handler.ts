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
 * Handles the /callback endpoint to process Google's OAuth 2.0 redirect.
 * Validates the state token, exchanges the authorization code for tokens,
 * and stores the encrypted tokens in DynamoDB.
 * 
 * Flow:
 * 1. Extract code, state, and error from query parameters
 * 2. Validate state token exists in DynamoDB and not expired
 * 3. Retrieve associated Cognito user ID from state token
 * 4. Handle user cancellation (error=access_denied)
 * 5. Exchange authorization code for tokens with Google
 * 6. Call TokenManager to encrypt and store tokens
 * 7. Delete used state token from DynamoDB
 * 8. Redirect to frontend with success or error status
 */

// Environment variables
const GOOGLE_CLIENT_ID_PARAM = process.env.GOOGLE_CLIENT_ID_PARAM!;
const GOOGLE_CLIENT_SECRET_PARAM = process.env.GOOGLE_CLIENT_SECRET_PARAM!;
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
  return `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}/api/integrations/gmail/callback`;
}

// Initialize AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

// Cache for SSM parameters
let cachedClientId: string | null = null;
let cachedClientSecret: string | null = null;

/**
 * Fetch Google OAuth credentials from SSM Parameter Store
 */
async function getGoogleCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  if (cachedClientId && cachedClientSecret) {
    return { clientId: cachedClientId, clientSecret: cachedClientSecret };
  }

  const [clientIdResponse, clientSecretResponse] = await Promise.all([
    ssmClient.send(new GetParameterCommand({
      Name: GOOGLE_CLIENT_ID_PARAM,
      WithDecryption: true,
    })),
    ssmClient.send(new GetParameterCommand({
      Name: GOOGLE_CLIENT_SECRET_PARAM,
      WithDecryption: true,
    })),
  ]);

  if (!clientIdResponse.Parameter?.Value || !clientSecretResponse.Parameter?.Value) {
    throw new Error('Google OAuth credentials not found in SSM Parameter Store');
  }

  cachedClientId = clientIdResponse.Parameter.Value;
  cachedClientSecret = clientSecretResponse.Parameter.Value;

  return { clientId: cachedClientId, clientSecret: cachedClientSecret };
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
 * @param code - Authorization code from Google
 * @param clientId - Google OAuth client ID
 * @param clientSecret - Google OAuth client secret
 * @param redirectUri - OAuth callback URI
 * @param logger - Logger instance
 * @returns Token response from Google
 */
async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  logger: Logger
): Promise<GoogleTokenResponse> {
  logger.debug('Exchanging authorization code for tokens');

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = await response.json() as GoogleTokenResponse;

    if (!response.ok || data.error) {
      logger.logGoogleAPIError('token_exchange', new Error(data.error_description || data.error || 'Token exchange failed'));
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    if (!data.refresh_token) {
      logger.warn('No refresh token received - user may have already authorized');
    }

    logger.debug('Token exchange successful', {
      scope: data.scope,
      expiresIn: data.expires_in,
    });
    return data;
  } catch (error) {
    logger.logGoogleAPIError('token_exchange', error as Error);
    throw error;
  }
}

/**
 * Get user's email from Google using access token
 * 
 * @param accessToken - OAuth access token
 * @param logger - Logger instance
 * @returns User's email address
 */
async function getUserEmail(accessToken: string, logger: Logger): Promise<string> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      logger.logGoogleAPIError('get_user_email', new Error(`Failed to fetch user email: ${response.status}`));
      throw new Error('Failed to fetch user email');
    }

    const data = await response.json() as { email?: string };
    return data.email || '';
  } catch (error) {
    logger.logGoogleAPIError('get_user_email', error as Error);
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
    params.set('gmail', 'connected');
  } else {
    params.set('gmail', 'error');
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

    // Fetch Google OAuth credentials from SSM
    const { clientId, clientSecret } = await getGoogleCredentials();

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri, logger);

    if (!tokenResponse.access_token) {
      throw new Error('No access token received from Google');
    }

    // Use refresh token from response, or access token as fallback
    const refreshToken = tokenResponse.refresh_token || tokenResponse.access_token;

    // Get user's email address
    const email = await getUserEmail(tokenResponse.access_token, logger);

    // Store encrypted tokens using TokenManager
    await tokenManager.storeTokens(
      cognitoUserId,
      tokenResponse.access_token,
      refreshToken,
      tokenResponse.expires_in,
      email
    );

    // Delete used state token
    await deleteStateToken(cognitoUserId, actualStateToken, logger);

    logger.logOAuthSuccess(cognitoUserId, email);

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
          'Failed to connect Gmail account'
        ),
      },
      body: '',
    };
  }
}

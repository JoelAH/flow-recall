import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from './logger';
import { tokenManager } from './token-manager';

/**
 * Disconnect Handler
 * 
 * Handles the /disconnect endpoint to disconnect the Slack integration
 * by revoking tokens with Slack and removing the integration from DynamoDB.
 * 
 * Flow:
 * 1. Validate Cognito session from authorizer context
 * 2. Call TokenManager.deleteTokens() which:
 *    - Retrieves encrypted tokens from DynamoDB
 *    - Decrypts access token using KMS
 *    - Revokes token with Slack API (auth.revoke)
 *    - Handles already-revoked tokens gracefully
 *    - Removes slackIntegration attribute from DynamoDB
 * 3. Return success response
 */

/**
 * Lambda handler for disconnect
 * 
 * @param event - API Gateway event with Cognito authorizer context
 * @returns Success or error response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const logger = createLogger(event.requestContext.requestId);
  logger.info('Disconnect request received');

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
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.info('Processing disconnect request', { userId: cognitoUserId });

    // Delete tokens using TokenManager
    // This handles:
    // - Retrieving encrypted tokens from DynamoDB
    // - Decrypting access token
    // - Revoking token with Slack (gracefully handles failures)
    // - Removing slackIntegration from DynamoDB
    await tokenManager.deleteTokens(cognitoUserId);

    logger.info('Disconnect successful', { userId: cognitoUserId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: 'Slack integration disconnected successfully',
      }),
    };
  } catch (error) {
    const errorObj = error as Error;
    
    // Check if error is due to no integration found
    if (errorObj.message.includes('User not found') || errorObj.message.includes('slackIntegration')) {
      logger.warn('No Slack integration found for user', {
        error: errorObj.message,
      });
      
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'not_found',
          message: 'No Slack integration found',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    logger.error('Disconnect failed', {
      error: errorObj.message,
      errorDetails: errorObj.stack,
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'internal_error',
        message: 'Failed to disconnect Slack integration',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

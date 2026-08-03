import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { tokenManager } from './token-manager';
import { createLogger } from './logger';

/**
 * Integration Disconnect Handler
 * 
 * Handles the /disconnect endpoint to disconnect Gmail integration.
 * Removes and revokes OAuth tokens, updating the integration status to disconnected.
 * 
 * Flow:
 * 1. Validate Cognito session from authorizer context
 * 2. Call TokenManager.deleteTokens() to remove and revoke tokens
 * 3. Return success response
 * 4. Handle errors gracefully with user-friendly messages
 */

/**
 * Disconnect response structure
 */
interface DisconnectResponse {
  success: boolean;
  message?: string;
}

/**
 * Lambda handler for integration disconnect
 * 
 * @param event - API Gateway event with Cognito authorizer context
 * @returns Success response or error
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const logger = createLogger(event.requestContext.requestId);
  logger.info('Integration disconnect request received');

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

    logger.info('Disconnecting Gmail integration', { userId: cognitoUserId });

    // Call TokenManager to delete and revoke tokens
    await tokenManager.deleteTokens(cognitoUserId);

    logger.info('Gmail integration disconnected successfully', { userId: cognitoUserId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: 'Gmail integration disconnected successfully',
      } as DisconnectResponse),
    };
  } catch (error) {
    const errorObj = error as Error;
    logger.error('Error disconnecting Gmail integration', {
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
        success: false,
        message: 'Failed to disconnect Gmail integration. Please try again.',
        error: 'service_unavailable',
        details: errorObj.message,
        retryable: true,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

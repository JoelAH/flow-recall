import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createLogger } from './logger';
import { getUserByCognitoId } from './dynamodb-helper';
import { SlackIntegration } from '../../lib/types/user-record';

/**
 * Status Handler
 * 
 * Handles the /status endpoint to retrieve the current Slack integration status
 * for the authenticated user.
 * 
 * Flow:
 * 1. Validate Cognito session from authorizer context
 * 2. Query DynamoDB for user record via GSI
 * 3. Check for slackIntegration attribute
 * 4. Return status with workspace info if connected
 */

// Initialize AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Validate SlackIntegration data structure
 * Returns true if the integration has all required fields
 */
function isValidSlackIntegration(integration: any): integration is SlackIntegration {
  return (
    integration &&
    typeof integration === 'object' &&
    typeof integration.encryptedAccessToken === 'string' &&
    typeof integration.encryptedRefreshToken === 'string' &&
    typeof integration.workspaceName === 'string' &&
    typeof integration.workspaceId === 'string' &&
    typeof integration.userId === 'string' &&
    typeof integration.connectedAt === 'string' &&
    typeof integration.expiresAt === 'number' &&
    integration.encryptedAccessToken.length > 0 &&
    integration.encryptedRefreshToken.length > 0
  );
}

/**
 * Lambda handler for status check
 * 
 * @param event - API Gateway event with Cognito authorizer context
 * @returns Integration status with workspace info if connected
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const logger = createLogger(event.requestContext.requestId);
  logger.info('Status check request received');

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

    logger.info('Checking integration status', { userId: cognitoUserId });

    // Query DynamoDB for user record via GSI
    const userRecord = await getUserByCognitoId(dynamoClient, cognitoUserId);

    // If no user record found, return disconnected status
    if (!userRecord) {
      logger.info('No user record found, returning disconnected status', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'disconnected',
        }),
      };
    }

    // Check for slackIntegration attribute
    const slackIntegration = userRecord.slackIntegration;

    if (!slackIntegration) {
      logger.info('No Slack integration found, returning disconnected status', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'disconnected',
        }),
      };
    }

    // Validate integration data structure
    if (!isValidSlackIntegration(slackIntegration)) {
      logger.warn('Slack integration data is corrupted or incomplete', {
        userId: cognitoUserId,
        hasAccessToken: !!slackIntegration.encryptedAccessToken,
        hasRefreshToken: !!slackIntegration.encryptedRefreshToken,
        hasWorkspaceName: !!slackIntegration.workspaceName,
      });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'error',
          errorMessage: 'Integration data is corrupted. Please reconnect your Slack workspace.',
        }),
      };
    }

    // Return connected status with workspace info
    logger.info('Slack integration found, returning connected status', {
      userId: cognitoUserId,
      workspaceName: slackIntegration.workspaceName,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'connected',
        workspaceName: slackIntegration.workspaceName,
        connectedAt: slackIntegration.connectedAt,
      }),
    };
  } catch (error) {
    const errorObj = error as Error;
    logger.error('Status check failed', {
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
        message: 'Failed to retrieve integration status',
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

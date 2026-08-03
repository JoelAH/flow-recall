import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GmailIntegration } from '../../lib/types/user-record';
import { createLogger } from './logger';
import { getUserByCognitoId } from './dynamodb-helper';

/**
 * Integration Status Handler
 * 
 * Handles the /status endpoint to check Gmail integration status.
 * Returns the current connection status, connected email, and connection timestamp.
 * 
 * Flow:
 * 1. Validate Cognito session from authorizer context
 * 2. Query DynamoDB for user's Gmail integration data
 * 3. Check token expiration status
 * 4. Return status ('connected', 'disconnected', 'expired'), email, and connectedAt
 */

// Environment variables
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;

// Initialize AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Status response structure
 */
interface StatusResponse {
  status: 'connected' | 'disconnected' | 'expired';
  email?: string;
  connectedAt?: string;
  errorMessage?: string;
}

/**
 * Lambda handler for integration status check
 * 
 * @param event - API Gateway event with Cognito authorizer context
 * @returns Current Gmail integration status
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const logger = createLogger(event.requestContext.requestId);
  logger.info('Integration status check request received');

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

    logger.info('Checking integration status', { userId: cognitoUserId });

    // Query DynamoDB using GSI for user's Gmail integration data
    const user = await getUserByCognitoId(dynamoClient, cognitoUserId);

    // Check if user exists and has Gmail integration
    if (!user || !user.gmailIntegration) {
      logger.info('No Gmail integration found', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'disconnected',
        } as StatusResponse),
      };
    }

    const integration = user.gmailIntegration as GmailIntegration;

    // If status is explicitly disconnected or error, return that status
    if (integration.status === 'disconnected') {
      logger.info('Gmail integration disconnected', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'disconnected',
          errorMessage: integration.errorMessage,
        } as StatusResponse),
      };
    }

    if (integration.status === 'error') {
      logger.info('Gmail integration in error state', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'disconnected',
          errorMessage: integration.errorMessage,
        } as StatusResponse),
      };
    }

    // Check if tokens exist
    if (!integration.encryptedAccessToken || !integration.encryptedRefreshToken) {
      logger.warn('Missing tokens for user', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'disconnected',
        } as StatusResponse),
      };
    }

    // Check token expiration
    const now = Date.now();
    const expiresAt = integration.tokenExpiresAt || 0;

    if (now >= expiresAt) {
      logger.info('Token expired', { userId: cognitoUserId });
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          status: 'expired',
          email: integration.connectedEmail,
          connectedAt: integration.connectedAt,
        } as StatusResponse),
      };
    }

    // Integration is connected and valid
    logger.info('Gmail integration connected', { userId: cognitoUserId, email: integration.connectedEmail });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        status: 'connected',
        email: integration.connectedEmail,
        connectedAt: integration.connectedAt,
      } as StatusResponse),
    };
  } catch (error) {
    const errorObj = error as Error;
    logger.error('Error checking integration status', {
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
        error: 'service_unavailable',
        message: 'Unable to check integration status, please try again',
        retryable: true,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Helper
 * 
 * Provides helper functions for querying and updating user records
 * using the cognitoUserIdIndex GSI since the table's partition key is internalUserId
 */

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME!;
const COGNITO_USER_ID_INDEX = 'cognitoUserIdIndex';

/**
 * Get user record by Cognito user ID using GSI
 * 
 * @param dynamoClient - DynamoDB Document Client
 * @param cognitoUserId - Cognito user ID
 * @returns User record or null if not found
 */
export async function getUserByCognitoId(
  dynamoClient: DynamoDBDocumentClient,
  cognitoUserId: string
): Promise<Record<string, any> | null> {
  const command = new QueryCommand({
    TableName: USERS_TABLE_NAME,
    IndexName: COGNITO_USER_ID_INDEX,
    KeyConditionExpression: 'cognitoUserId = :cognitoUserId',
    ExpressionAttributeValues: {
      ':cognitoUserId': cognitoUserId,
    },
    Limit: 1,
  });

  const response = await dynamoClient.send(command as any) as any;

  if (!response.Items || response.Items.length === 0) {
    return null;
  }

  return response.Items[0];
}

/**
 * Update user record by Cognito user ID
 * First queries for the internalUserId, then performs the update
 * 
 * @param dynamoClient - DynamoDB Document Client
 * @param cognitoUserId - Cognito user ID
 * @param updateExpression - DynamoDB update expression
 * @param expressionAttributeNames - Expression attribute names
 * @param expressionAttributeValues - Expression attribute values
 */
export async function updateUserByCognitoId(
  dynamoClient: DynamoDBDocumentClient,
  cognitoUserId: string,
  updateExpression: string,
  expressionAttributeNames?: Record<string, string>,
  expressionAttributeValues?: Record<string, any>
): Promise<void> {
  // First, get the user's internalUserId
  const user = await getUserByCognitoId(dynamoClient, cognitoUserId);

  if (!user || !user.internalUserId) {
    throw new Error(`User not found for cognitoUserId: ${cognitoUserId}`);
  }

  // Log the update command for debugging
  console.log(JSON.stringify({
    level: 'DEBUG',
    message: 'DynamoDB Update Command',
    updateExpression,
    expressionAttributeNames,
    expressionAttributeValues: expressionAttributeValues ? Object.keys(expressionAttributeValues) : undefined,
    internalUserId: user.internalUserId,
  }));

  // Now update using the actual partition key
  const command = new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { internalUserId: user.internalUserId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  await dynamoClient.send(command as any);
}

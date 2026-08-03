import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamodbClient = new DynamoDBClient({});

interface CognitoPostConfirmationEvent {
  request: {
    userAttributes: {
      sub: string;
      email: string;
    };
  };
  response: Record<string, unknown>;
}

export async function handler(event: CognitoPostConfirmationEvent): Promise<CognitoPostConfirmationEvent> {
  const cognitoUserId = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;
  const internalUserId = uuidv4();
  const timestamp = new Date().toISOString();

  try {
    await dynamodbClient.send(
      new PutItemCommand({
        TableName: process.env.USERS_TABLE_NAME,
        Item: {
          internalUserId: { S: internalUserId },
          cognitoUserId: { S: cognitoUserId },
          email: { S: email },
          userRole: { S: 'ORG_OWNER' },
          created: { S: timestamp },
          updated: { S: timestamp },
        },
      })
    );

    console.log(
      JSON.stringify({
        level: 'INFO',
        message: 'User record created successfully',
        internalUserId,
        cognitoUserId,
        email,
      })
    );

    return event;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        message: 'Failed to create user record',
        internalUserId,
        cognitoUserId,
        email,
        error: error instanceof Error ? error.name : 'Unknown error',
        errorDetails: error instanceof Error ? error.message : String(error),
      })
    );

    throw error;
  }
}

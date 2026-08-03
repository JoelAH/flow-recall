import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';

describe('DatabaseStack', () => {
  test('Creates users table with correct configuration', () => {
    const app = new cdk.App();
    const stack = new DatabaseStack(app, 'TestDatabaseStack');
    const template = Template.fromStack(stack);

    // Verify DynamoDB table exists
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
  });
});

describe('AuthStack', () => {
  test('Stack can be synthesized', () => {
    const app = new cdk.App({
      context: {
        googleClientId: 'test-client-id',
        callbackUrls: ['http://localhost:5173/callback'],
        logoutUrls: ['http://localhost:5173/login'],
      },
    });
    const databaseStack = new DatabaseStack(app, 'TestDatabaseStack');
    
    // This will throw if there are synthesis errors
    expect(() => {
      new AuthStack(app, 'TestAuthStack', {
        usersTable: databaseStack.usersTable,
      });
    }).not.toThrow();
  });
});

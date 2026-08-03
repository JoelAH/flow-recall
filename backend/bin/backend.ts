#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
// import { BackendStack } from '../lib/backend-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { GmailIntegrationStack } from '../lib/gmail-integration-stack';
import { SlackIntegrationStack } from '../lib/slack-integration-stack';
import { DataIngestionStack } from '../lib/data-ingestion-stack';
import { BedrockAnalysisStack } from '../lib/bedrock-analysis-stack';

const app = new cdk.App();

// Create DatabaseStack first
const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

// Create AuthStack with dependency on DatabaseStack
const authStack = new AuthStack(app, 'AuthStack', {
  usersTable: databaseStack.usersTable,
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Explicitly configure stack dependency
authStack.addDependency(databaseStack);

// Create GmailIntegrationStack with dependency on DatabaseStack and AuthStack
const gmailIntegrationStack = new GmailIntegrationStack(app, 'GmailIntegrationStack', {
  usersTable: databaseStack.usersTable,
  userPoolArn: authStack.userPool.userPoolArn,
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Explicitly configure stack dependencies
gmailIntegrationStack.addDependency(databaseStack);
gmailIntegrationStack.addDependency(authStack);

// Create SlackIntegrationStack with dependency on DatabaseStack, AuthStack, and GmailIntegrationStack (for shared KMS key)
const slackIntegrationStack = new SlackIntegrationStack(app, 'SlackIntegrationStack', {
  usersTable: databaseStack.usersTable,
  userPoolArn: authStack.userPool.userPoolArn,
  oauthTokensKey: gmailIntegrationStack.oauthTokensKey, // Reuse KMS key from Gmail integration
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Explicitly configure stack dependencies
slackIntegrationStack.addDependency(databaseStack);
slackIntegrationStack.addDependency(authStack);
slackIntegrationStack.addDependency(gmailIntegrationStack); // Depends on Gmail stack for KMS key

// Create DataIngestionStack with dependencies on DatabaseStack, AuthStack, and GmailIntegrationStack (for KMS key)
const dataIngestionStack = new DataIngestionStack(app, 'DataIngestionStack', {
  usersTable: databaseStack.usersTable,
  userPoolId: authStack.userPool.userPoolId,
  oauthTokensKey: gmailIntegrationStack.oauthTokensKey,
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Explicitly configure stack dependencies
dataIngestionStack.addDependency(databaseStack);
dataIngestionStack.addDependency(authStack);
dataIngestionStack.addDependency(gmailIntegrationStack);

// Create BedrockAnalysisStack with dependency on DataIngestionStack
const bedrockAnalysisStack = new BedrockAnalysisStack(app, 'BedrockAnalysisStack', {
  messagesTable: dataIngestionStack.messagesTable,
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Explicitly configure stack dependency
bedrockAnalysisStack.addDependency(dataIngestionStack);

// BackendStack (placeholder for future FlowRecall features - S3, EventBridge, Bedrock, etc.)
// Uncomment when ready to implement the event-driven pipeline
// new BackendStack(app, 'BackendStack', {
//   // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
// });
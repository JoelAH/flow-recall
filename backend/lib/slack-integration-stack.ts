import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SlackIntegrationStackProps extends cdk.StackProps {
  usersTable: dynamodb.ITable;
  userPoolArn: string;
  oauthTokensKey: kms.IKey; // Shared KMS key from Gmail integration
}

export class SlackIntegrationStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: SlackIntegrationStackProps) {
    super(scope, id, props);

    // Parameter Store paths for Slack OAuth credentials
    // These parameters must be created manually after deployment
    const slackClientIdParam = '/flowrecall/slack-oauth-client-id';
    const slackClientSecretParam = '/flowrecall/slack-oauth-client-secret';

    // Create API Gateway REST API
    this.api = new apigateway.RestApi(this, 'SlackIntegrationApi', {
      restApiName: 'FlowRecall Slack Integration API',
      description: 'API for Slack OAuth integration',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,  // 10 requests per second per user
        throttlingBurstLimit: 20, // Burst of 20 requests
      },
      defaultCorsPreflightOptions: {
        allowOrigins: ['http://localhost:5173', 'https://app.flowrecall.com'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
    });

    // Create Cognito Authorizer for protected endpoints
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [
        cognito.UserPool.fromUserPoolArn(this, 'UserPool', props.userPoolArn),
      ],
      authorizerName: 'SlackCognitoAuthorizer',
      identitySource: 'method.request.header.Authorization',
    });

    // Create Lambda functions for OAuth flow
    const authorizeLambda = new nodejs.NodejsFunction(this, 'AuthorizeLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/slack-integration/oauth-initiation-handler.ts',
      timeout: cdk.Duration.seconds(10),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        SLACK_CLIENT_ID_PARAM: slackClientIdParam,
        STATE_TOKEN_TTL: '300', // 5 minutes
        // API Gateway will pass the API ID and stage via context
        // Lambda will construct the redirect URI at runtime
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    const callbackLambda = new nodejs.NodejsFunction(this, 'CallbackLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/slack-integration/oauth-callback-handler.ts',
      timeout: cdk.Duration.seconds(30),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        SLACK_CLIENT_ID_PARAM: slackClientIdParam,
        SLACK_CLIENT_SECRET_PARAM: slackClientSecretParam,
        KMS_KEY_ID: props.oauthTokensKey.keyId,
        FRONTEND_URL: 'http://localhost:5173', // TODO: Make this configurable per environment
        // Lambda will construct the redirect URI at runtime
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    const statusLambda = new nodejs.NodejsFunction(this, 'StatusLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/slack-integration/status.ts',
      timeout: cdk.Duration.seconds(10),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    const disconnectLambda = new nodejs.NodejsFunction(this, 'DisconnectLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/slack-integration/disconnect.ts',
      timeout: cdk.Duration.seconds(30),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        SLACK_CLIENT_ID_PARAM: slackClientIdParam,
        SLACK_CLIENT_SECRET_PARAM: slackClientSecretParam,
        KMS_KEY_ID: props.oauthTokensKey.keyId,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Grant permissions to Lambda functions
    props.usersTable.grantReadWriteData(authorizeLambda);
    props.usersTable.grantReadWriteData(callbackLambda);
    props.usersTable.grantReadData(statusLambda);
    props.usersTable.grantReadWriteData(disconnectLambda);

    // Grant SSM Parameter Store read permissions
    const ssmPolicy = new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/flowrecall/slack-oauth-*`,
      ],
    });

    authorizeLambda.addToRolePolicy(ssmPolicy);
    callbackLambda.addToRolePolicy(ssmPolicy);
    disconnectLambda.addToRolePolicy(ssmPolicy);

    // Grant KMS encrypt/decrypt permissions using the shared key
    props.oauthTokensKey.grantEncryptDecrypt(callbackLambda);
    props.oauthTokensKey.grantEncryptDecrypt(disconnectLambda);

    // Create API Gateway resources and methods
    const integrations = this.api.root.addResource('api').addResource('integrations');
    const slack = integrations.addResource('slack');

    // GET /api/integrations/slack/authorize (Cognito authorized)
    const authorize = slack.addResource('authorize');
    authorize.addMethod('GET', new apigateway.LambdaIntegration(authorizeLambda), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /api/integrations/slack/callback (public with state validation)
    const callback = slack.addResource('callback');
    callback.addMethod('GET', new apigateway.LambdaIntegration(callbackLambda), {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // GET /api/integrations/slack/status (Cognito authorized)
    const status = slack.addResource('status');
    status.addMethod('GET', new apigateway.LambdaIntegration(statusLambda), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // POST /api/integrations/slack/disconnect (Cognito authorized)
    const disconnect = slack.addResource('disconnect');
    disconnect.addMethod('POST', new apigateway.LambdaIntegration(disconnectLambda), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add usage plan for rate limiting
    const usagePlan = this.api.addUsagePlan('SlackIntegrationUsagePlan', {
      name: 'Slack Integration Usage Plan',
      description: 'Usage plan for Slack integration API',
      throttle: {
        rateLimit: 10,  // 10 requests per second
        burstLimit: 20, // Burst of 20 requests
      },
      quota: {
        limit: 1000,    // 1000 requests per day
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });

    // Export API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL for Slack integration',
      exportName: 'SlackIntegrationApiUrl',
    });

    // Export Parameter Store paths
    new cdk.CfnOutput(this, 'SlackOAuthClientIdParam', {
      value: slackClientIdParam,
      description: 'SSM Parameter Store path for Slack OAuth Client ID',
      exportName: 'SlackOAuthClientIdParam',
    });

    new cdk.CfnOutput(this, 'SlackOAuthClientSecretParam', {
      value: slackClientSecretParam,
      description: 'SSM Parameter Store path for Slack OAuth Client Secret',
      exportName: 'SlackOAuthClientSecretParam',
    });

    // Output instructions for setting up OAuth credentials
    new cdk.CfnOutput(this, 'SetupInstructions', {
      value: 'After deployment, create SSM parameters with actual Slack OAuth credentials',
      description: 'Setup instructions',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GmailIntegrationStackProps extends cdk.StackProps {
  usersTable: dynamodb.ITable;
  userPoolArn: string;
}

export class GmailIntegrationStack extends cdk.Stack {
  public readonly oauthTokensKey: kms.Key;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: GmailIntegrationStackProps) {
    super(scope, id, props);

    // Create KMS key for OAuth token encryption
    this.oauthTokensKey = new kms.Key(this, 'OAuthTokensKey', {
      description: 'KMS key for encrypting Gmail OAuth tokens',
      enableKeyRotation: true, // Enable automatic annual key rotation
      alias: 'alias/flowrecall-oauth-tokens',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain key on stack deletion for security
    });

    // Parameter Store paths for Google OAuth credentials
    // These parameters must be created manually after deployment
    const gmailClientIdParam = '/flowrecall/google-oauth-client-id';
    const gmailClientSecretParam = '/flowrecall/google-oauth-client-secret';

    // Create API Gateway REST API
    this.api = new apigateway.RestApi(this, 'GmailIntegrationApi', {
      restApiName: 'FlowRecall Gmail Integration API',
      description: 'API for Gmail OAuth integration',
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
      authorizerName: 'CognitoAuthorizer',
      identitySource: 'method.request.header.Authorization',
    });

    // Create Lambda functions for OAuth flow
    const authorizeLambda = new nodejs.NodejsFunction(this, 'AuthorizeLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/gmail-integration/oauth-initiation-handler.ts',
      timeout: cdk.Duration.seconds(10),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        GOOGLE_CLIENT_ID_PARAM: gmailClientIdParam,
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
      entry: './lambda/gmail-integration/oauth-callback-handler.ts',
      timeout: cdk.Duration.seconds(30),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        GOOGLE_CLIENT_ID_PARAM: gmailClientIdParam,
        GOOGLE_CLIENT_SECRET_PARAM: gmailClientSecretParam,
        KMS_KEY_ID: this.oauthTokensKey.keyId,
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
      entry: './lambda/gmail-integration/status.ts',
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
      entry: './lambda/gmail-integration/disconnect.ts',
      timeout: cdk.Duration.seconds(30),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        GOOGLE_OAUTH_CLIENT_ID_PARAM: gmailClientIdParam,
        GOOGLE_OAUTH_CLIENT_SECRET_PARAM: gmailClientSecretParam,
        KMS_KEY_ID: this.oauthTokensKey.keyId,
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
        `arn:aws:ssm:${this.region}:${this.account}:parameter/flowrecall/google-oauth-*`,
      ],
    });

    authorizeLambda.addToRolePolicy(ssmPolicy);
    callbackLambda.addToRolePolicy(ssmPolicy);
    disconnectLambda.addToRolePolicy(ssmPolicy);

    this.oauthTokensKey.grantEncryptDecrypt(callbackLambda);
    this.oauthTokensKey.grantEncryptDecrypt(disconnectLambda);

    // Create API Gateway resources and methods
    const integrations = this.api.root.addResource('api').addResource('integrations');
    const gmail = integrations.addResource('gmail');

    // GET /api/integrations/gmail/authorize (Cognito authorized)
    const authorize = gmail.addResource('authorize');
    authorize.addMethod('GET', new apigateway.LambdaIntegration(authorizeLambda), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /api/integrations/gmail/callback (public with state validation)
    const callback = gmail.addResource('callback');
    callback.addMethod('GET', new apigateway.LambdaIntegration(callbackLambda), {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    // GET /api/integrations/gmail/status (Cognito authorized)
    const status = gmail.addResource('status');
    status.addMethod('GET', new apigateway.LambdaIntegration(statusLambda), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // POST /api/integrations/gmail/disconnect (Cognito authorized)
    const disconnect = gmail.addResource('disconnect');
    disconnect.addMethod('POST', new apigateway.LambdaIntegration(disconnectLambda), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add usage plan for rate limiting
    const usagePlan = this.api.addUsagePlan('GmailIntegrationUsagePlan', {
      name: 'Gmail Integration Usage Plan',
      description: 'Usage plan for Gmail integration API',
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
      description: 'API Gateway URL for Gmail integration',
      exportName: 'GmailIntegrationApiUrl',
    });

    // Export KMS key ARN for reference
    new cdk.CfnOutput(this, 'OAuthTokensKeyArn', {
      value: this.oauthTokensKey.keyArn,
      description: 'KMS key ARN for OAuth token encryption',
      exportName: 'OAuthTokensKeyArn',
    });

    new cdk.CfnOutput(this, 'OAuthTokensKeyId', {
      value: this.oauthTokensKey.keyId,
      description: 'KMS key ID for OAuth token encryption',
      exportName: 'OAuthTokensKeyId',
    });

    new cdk.CfnOutput(this, 'GmailOAuthClientIdParam', {
      value: gmailClientIdParam,
      description: 'SSM Parameter Store path for Gmail OAuth Client ID',
      exportName: 'GmailOAuthClientIdParam',
    });

    new cdk.CfnOutput(this, 'GmailOAuthClientSecretParam', {
      value: gmailClientSecretParam,
      description: 'SSM Parameter Store path for Gmail OAuth Client Secret',
      exportName: 'GmailOAuthClientSecretParam',
    });

    // Output instructions for setting up OAuth credentials
    new cdk.CfnOutput(this, 'SetupInstructions', {
      value: 'After deployment, create SSM parameters with actual Google OAuth credentials',
      description: 'Setup instructions',
    });
  }
}

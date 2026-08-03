import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  usersTable: dynamodb.ITable;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'flowrecall-user-pool',
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Get callback and logout URLs from CDK context
    const callbackUrls = this.node.tryGetContext('callbackUrls') || [
      'http://localhost:5173/callback',
    ];
    const logoutUrls = this.node.tryGetContext('logoutUrls') || [
      'http://localhost:5173/login',
    ];

    // Get Google OAuth configuration from CDK context
    const googleClientId = this.node.tryGetContext('googleClientId');
    if (!googleClientId) {
      throw new Error('Google Client ID not configured. Set googleClientId in CDK context.');
    }

    // Fetch Google client secret from Parameter Store using Custom Resource
    const getParameter = new cr.AwsCustomResource(this, 'GetGoogleClientSecret', {
      onUpdate: {
        service: 'SSM',
        action: 'getParameter',
        parameters: {
          Name: '/flowrecall/google-oauth-client-secret',
          WithDecryption: true,
        },
        physicalResourceId: cr.PhysicalResourceId.of('google-client-secret-param'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/flowrecall/google-oauth-client-secret`,
        ],
      }),
    });

    const googleClientSecret = getParameter.getResponseField('Parameter.Value');

    // Configure Google Identity Provider
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: googleClientId,
      clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
      scopes: ['email', 'profile', 'openid'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });

    // Create User Pool Client with Google provider enabled
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'flowrecall-client',
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.OPENID,
        ],
        callbackUrls,
        logoutUrls,
      },
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      generateSecret: false,
    });

    // Ensure the identity provider is created before the client
    this.userPoolClient.node.addDependency(googleProvider);

    // Get domain prefix from CDK context or use default
    const domainPrefix = this.node.tryGetContext('cognitoDomainPrefix') || 'flowrecall-auth';

    // Create User Pool Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix,
      },
    });

    // Create Post-Confirmation Lambda function
    const postConfirmationLambda = new nodejs.NodejsFunction(this, 'PostConfirmationLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/post-confirmation/index.ts',
      timeout: cdk.Duration.seconds(10),
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Grant Lambda write permissions to users table
    props.usersTable.grantWriteData(postConfirmationLambda);

    // Attach Lambda as post-confirmation trigger
    this.userPool.addTrigger(
      cognito.UserPoolOperation.POST_CONFIRMATION,
      postConfirmationLambda
    );

    // Export Cognito configuration values for frontend
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'UserPoolClientId',
    });

    new cdk.CfnOutput(this, 'UserPoolDomainOutput', {
      value: `${domainPrefix}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain',
      exportName: 'UserPoolDomain',
    });
  }
}

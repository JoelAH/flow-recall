import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DataIngestionStackProps extends cdk.StackProps {
  usersTable: dynamodb.Table;
  userPoolId: string;
  oauthTokensKey: cdk.aws_kms.IKey;
}

export class DataIngestionStack extends cdk.Stack {
  public readonly jobsTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: DataIngestionStackProps) {
    super(scope, id, props);

    // Create Jobs table with GSIs
    this.jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: 'data-ingestion-jobs',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Changed to DESTROY for easier cleanup
    });

    // Add UserIdStatusIndex GSI for concurrent job counting
    this.jobsTable.addGlobalSecondaryIndex({
      indexName: 'UserIdStatusIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add UserIdCreatedAtIndex GSI for chronological listing
    this.jobsTable.addGlobalSecondaryIndex({
      indexName: 'UserIdCreatedAtIndex',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create Messages table with GSIs
    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: 'data-ingestion-messages',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'messageId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Changed to DESTROY for easier cleanup
    });

    // Add JobIdTimestampIndex GSI for chronological message retrieval
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'JobIdTimestampIndex',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add JobIdDeduplicationHashIndex GSI for deduplication checks
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'JobIdDeduplicationHashIndex',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'deduplicationHash',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // Create Lambda functions
    const createJobLambda = new nodejs.NodejsFunction(this, 'CreateJobFunction', {
      functionName: 'DataIngestion-CreateJob',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/data-ingestion/create-job.ts',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        JOBS_TABLE_NAME: this.jobsTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    const processJobLambda = new nodejs.NodejsFunction(this, 'ProcessJobFunction', {
      functionName: 'DataIngestion-ProcessJob',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/data-ingestion/process-job.ts',
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        USERS_TABLE_NAME: props.usersTable.tableName,
        JOBS_TABLE_NAME: this.jobsTable.tableName,
        MESSAGES_TABLE_NAME: this.messagesTable.tableName,
        KMS_KEY_ID: props.oauthTokensKey.keyId,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    const getStatusLambda = new nodejs.NodejsFunction(this, 'GetStatusFunction', {
      functionName: 'DataIngestion-GetStatus',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/data-ingestion/get-status.ts',
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      environment: {
        JOBS_TABLE_NAME: this.jobsTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Grant Lambda permissions
    this.jobsTable.grantReadWriteData(createJobLambda);
    this.jobsTable.grantReadWriteData(processJobLambda);
    this.jobsTable.grantReadData(getStatusLambda);
    props.usersTable.grantReadData(processJobLambda);
    this.messagesTable.grantReadWriteData(processJobLambda);
    props.oauthTokensKey.grantDecrypt(processJobLambda);

    // Grant CreateJobLambda permission to invoke ProcessJobLambda
    processJobLambda.grantInvoke(createJobLambda);
    createJobLambda.addEnvironment('PROCESS_JOB_FUNCTION_NAME', processJobLambda.functionArn);

    // Grant ProcessJobLambda permission to read SSM parameters
    processJobLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/flow-recall/google/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/flow-recall/slack/*`,
      ],
    }));

    // Grant ProcessJobLambda permission to emit CloudWatch metrics
    processJobLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    // Grant ProcessJobLambda permission to publish EventBridge events
    processJobLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['events:PutEvents'],
      resources: ['*'],
    }));

    // Create API Gateway with Cognito authorizer
    this.api = new apigateway.RestApi(this, 'DataIngestionApi', {
      restApiName: 'Data Ingestion API',
      description: 'API for data ingestion pipeline',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: 'prod',
        // Logging disabled temporarily - requires CloudWatch Logs role ARN in account settings
        // loggingLevel: apigateway.MethodLoggingLevel.INFO,
        // dataTraceEnabled: true,
      },
    });

    // Create Cognito authorizer
    const userPoolArn = `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${props.userPoolId}`;
    const userPool = cdk.aws_cognito.UserPool.fromUserPoolArn(this, 'UserPool', userPoolArn);
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // Create /api/jobs resource
    const apiResource = this.api.root.addResource('api');
    const jobsResource = apiResource.addResource('jobs');

    // POST /api/jobs endpoint
    jobsResource.addMethod('POST', new apigateway.LambdaIntegration(createJobLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // GET /api/jobs/{jobId} endpoint
    const jobIdResource = jobsResource.addResource('{jobId}');
    jobIdResource.addMethod('GET', new apigateway.LambdaIntegration(getStatusLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Export outputs
    new cdk.CfnOutput(this, 'JobsTableName', {
      value: this.jobsTable.tableName,
      description: 'DynamoDB Jobs table name',
      exportName: 'JobsTableName',
    });

    new cdk.CfnOutput(this, 'MessagesTableName', {
      value: this.messagesTable.tableName,
      description: 'DynamoDB Messages table name',
      exportName: 'MessagesTableName',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
      exportName: 'DataIngestionApiEndpoint',
    });
  }
}

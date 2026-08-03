import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface BedrockAnalysisStackProps extends cdk.StackProps {
  messagesTable: dynamodb.Table;
}

export class BedrockAnalysisStack extends cdk.Stack {
  public readonly analysisTable: dynamodb.Table;
  public readonly messageAnalyzerFunction: lambda.Function;
  public readonly timelineGeneratorFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: BedrockAnalysisStackProps) {
    super(scope, id, props);

    // Create Analysis DynamoDB table with GSIs
    this.analysisTable = new dynamodb.Table(this, 'AnalysisTable', {
      tableName: 'bedrock-analysis',
      partitionKey: {
        name: 'analysisId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add JobIdCreatedAtIndex GSI
    this.analysisTable.addGlobalSecondaryIndex({
      indexName: 'JobIdCreatedAtIndex',
      partitionKey: {
        name: 'jobId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add UserIdCreatedAtIndex GSI
    this.analysisTable.addGlobalSecondaryIndex({
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

    // Create IAM role for Lambda functions with Bedrock permissions
    const bedrockExecutionRole = new iam.Role(this, 'BedrockLambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Bedrock analysis Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add Bedrock permissions
    bedrockExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: ['arn:aws:bedrock:*::foundation-model/*'],
    }));

    // Add DynamoDB read permissions for Messages table
    bedrockExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Query',
        'dynamodb:GetItem',
      ],
      resources: [
        props.messagesTable.tableArn,
        `${props.messagesTable.tableArn}/index/*`,
      ],
    }));

    // Add DynamoDB write permissions for Analysis table
    bedrockExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
      ],
      resources: [
        this.analysisTable.tableArn,
      ],
    }));

    // Add CloudWatch Logs and Metrics permissions
    bedrockExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'cloudwatch:PutMetricData',
      ],
      resources: ['*'],
    }));

    // Create dead-letter queue for failed invocations
    const dlq = new sqs.Queue(this, 'AnalysisDLQ', {
      queueName: 'bedrock-analysis-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    // Create Message_Analyzer Lambda function
    this.messageAnalyzerFunction = new nodejs.NodejsFunction(this, 'MessageAnalyzerFunction', {
      functionName: 'BedrockAnalysis-MessageAnalyzer',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/bedrock-analysis/message-analyzer/index.ts',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      role: bedrockExecutionRole,
      environment: {
        MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        MESSAGES_TABLE_NAME: props.messagesTable.tableName,
        ANALYSIS_TABLE_NAME: this.analysisTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      deadLetterQueue: dlq,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Create Timeline_Generator Lambda function
    this.timelineGeneratorFunction = new nodejs.NodejsFunction(this, 'TimelineGeneratorFunction', {
      functionName: 'BedrockAnalysis-TimelineGenerator',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: './lambda/bedrock-analysis/timeline-generator/index.ts',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      role: bedrockExecutionRole,
      environment: {
        MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        MESSAGES_TABLE_NAME: props.messagesTable.tableName,
        ANALYSIS_TABLE_NAME: this.analysisTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      deadLetterQueue: dlq,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Create EventBridge rule for triggering analysis
    const jobCompletedRule = new events.Rule(this, 'JobCompletedRule', {
      ruleName: 'bedrock-analysis-job-completed',
      description: 'Triggers Bedrock analysis when data ingestion job completes',
      eventPattern: {
        source: ['flow-recall.data-ingestion'],
        detailType: ['Job Completed'],
        detail: {
          jobId: [{ exists: true }],
        },
      },
    });

    // Add Lambda functions as targets with retry policy
    jobCompletedRule.addTarget(new targets.LambdaFunction(this.messageAnalyzerFunction, {
      deadLetterQueue: dlq,
      maxEventAge: cdk.Duration.hours(2),
      retryAttempts: 2,
    }));

    jobCompletedRule.addTarget(new targets.LambdaFunction(this.timelineGeneratorFunction, {
      deadLetterQueue: dlq,
      maxEventAge: cdk.Duration.hours(2),
      retryAttempts: 2,
    }));

    // Export outputs
    new cdk.CfnOutput(this, 'AnalysisTableName', {
      value: this.analysisTable.tableName,
      description: 'DynamoDB Analysis table name',
      exportName: 'AnalysisTableName',
    });

    new cdk.CfnOutput(this, 'AnalysisTableArn', {
      value: this.analysisTable.tableArn,
      description: 'DynamoDB Analysis table ARN',
      exportName: 'AnalysisTableArn',
    });

    new cdk.CfnOutput(this, 'MessageAnalyzerFunctionArn', {
      value: this.messageAnalyzerFunction.functionArn,
      description: 'Message Analyzer Lambda function ARN',
      exportName: 'MessageAnalyzerFunctionArn',
    });

    new cdk.CfnOutput(this, 'TimelineGeneratorFunctionArn', {
      value: this.timelineGeneratorFunction.functionArn,
      description: 'Timeline Generator Lambda function ARN',
      exportName: 'TimelineGeneratorFunctionArn',
    });

    // Create SNS topic for alarms
    const alarmTopic = new sns.Topic(this, 'AnalysisAlarmTopic', {
      topicName: 'bedrock-analysis-alarms',
      displayName: 'Bedrock Analysis Alarms',
    });

    // Create CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'AnalysisDashboard', {
      dashboardName: 'BedrockAnalysis',
    });

    // Lambda invocation metrics
    const messageAnalyzerInvocations = this.messageAnalyzerFunction.metricInvocations({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const timelineGeneratorInvocations = this.timelineGeneratorFunction.metricInvocations({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const messageAnalyzerErrors = this.messageAnalyzerFunction.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const timelineGeneratorErrors = this.timelineGeneratorFunction.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const messageAnalyzerDuration = this.messageAnalyzerFunction.metricDuration({
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const timelineGeneratorDuration = this.timelineGeneratorFunction.metricDuration({
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // Bedrock invocation metrics (custom metrics emitted by Lambda functions)
    const bedrockInvocationFailed = new cloudwatch.Metric({
      namespace: 'BedrockAnalysis',
      metricName: 'BedrockInvocationFailed',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const bedrockRateLimitErrors = new cloudwatch.Metric({
      namespace: 'BedrockAnalysis',
      metricName: 'BedrockInvocationFailed',
      dimensionsMap: {
        ErrorType: 'RATE_LIMIT',
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const bedrockAuthErrors = new cloudwatch.Metric({
      namespace: 'BedrockAnalysis',
      metricName: 'BedrockInvocationFailed',
      dimensionsMap: {
        ErrorType: 'AUTH',
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // Add widgets to dashboard
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        left: [messageAnalyzerInvocations, timelineGeneratorInvocations],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [messageAnalyzerErrors, timelineGeneratorErrors],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration (ms)',
        left: [messageAnalyzerDuration, timelineGeneratorDuration],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Bedrock Invocation Failures',
        left: [bedrockInvocationFailed],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Bedrock Error Types',
        left: [bedrockRateLimitErrors, bedrockAuthErrors],
        width: 12,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'DLQ Messages',
        metrics: [dlq.metricApproximateNumberOfMessagesVisible()],
        width: 12,
      })
    );

    // Create alarm for Bedrock rate limit errors
    const rateLimitAlarm = new cloudwatch.Alarm(this, 'BedrockRateLimitAlarm', {
      alarmName: 'BedrockAnalysis-RateLimitExceeded',
      alarmDescription: 'Bedrock API rate limit exceeded',
      metric: bedrockRateLimitErrors,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    rateLimitAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Create alarm for Bedrock authentication errors
    const authErrorAlarm = new cloudwatch.Alarm(this, 'BedrockAuthErrorAlarm', {
      alarmName: 'BedrockAnalysis-AuthenticationError',
      alarmDescription: 'Bedrock authentication or authorization failure',
      metric: bedrockAuthErrors,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    authErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Create alarm for overall error rate exceeding 10%
    const errorRateAlarm = new cloudwatch.Alarm(this, 'HighErrorRateAlarm', {
      alarmName: 'BedrockAnalysis-HighErrorRate',
      alarmDescription: 'Error rate exceeds 10% of total invocations',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / invocations) * 100',
        usingMetrics: {
          errors: messageAnalyzerErrors.with({ statistic: 'Sum' }),
          invocations: messageAnalyzerInvocations.with({ statistic: 'Sum' }),
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Export alarm topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS topic ARN for CloudWatch alarms',
      exportName: 'AnalysisAlarmTopicArn',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}

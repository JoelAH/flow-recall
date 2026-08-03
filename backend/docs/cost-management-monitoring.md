# Cost Management and Monitoring Guide

This guide provides detailed information about the cost structure, monitoring strategies, and optimization techniques for the Bedrock Message Analysis feature.

## Overview

The Bedrock Message Analysis feature incurs costs from several AWS services. Understanding the pricing model and implementing proper monitoring helps control costs and prevent unexpected charges.

## Cost Components

### 1. Amazon Bedrock Pricing

Bedrock charges are based on **per-token usage** (input + output tokens).

#### Claude 3 Haiku (Recommended)

- **Input tokens**: $0.25 per 1 million tokens
- **Output tokens**: $1.25 per 1 million tokens
- **Typical analysis**: 50,000 input tokens + 2,000 output tokens
- **Cost per analysis**: ~$0.015

**Example calculation**:
```
Input cost:  50,000 tokens × $0.25 / 1M = $0.0125
Output cost:  2,000 tokens × $1.25 / 1M = $0.0025
Total:                                    $0.015
```

#### Claude 3 Sonnet (Higher Quality)

- **Input tokens**: $3.00 per 1 million tokens
- **Output tokens**: $15.00 per 1 million tokens
- **Typical analysis**: 50,000 input tokens + 2,000 output tokens
- **Cost per analysis**: ~$0.18

**Example calculation**:
```
Input cost:  50,000 tokens × $3.00 / 1M = $0.15
Output cost:  2,000 tokens × $15.00 / 1M = $0.03
Total:                                     $0.18
```

#### Amazon Titan Text Express (AWS Native)

- **Input tokens**: $0.20 per 1 million tokens
- **Output tokens**: $0.60 per 1 million tokens
- **Typical analysis**: 50,000 input tokens + 2,000 output tokens
- **Cost per analysis**: ~$0.011

**Example calculation**:
```
Input cost:  50,000 tokens × $0.20 / 1M = $0.01
Output cost:  2,000 tokens × $0.60 / 1M = $0.0012
Total:                                    $0.0112
```

### 2. AWS Lambda Pricing

Lambda charges for compute time and requests:

- **Requests**: $0.20 per 1 million requests
- **Compute**: $0.0000166667 per GB-second
- **Configuration**: 512 MB memory, ~30 second average execution
- **Cost per invocation**: ~$0.00025

**Example calculation** (1,000 analyses per month):
```
Request cost: 2,000 requests × $0.20 / 1M = $0.0004
Compute cost: 2,000 × (512MB/1024) × 30s × $0.0000166667 = $0.50
Total Lambda cost:                                          $0.50
```

### 3. DynamoDB Pricing

DynamoDB uses on-demand pricing (PAY_PER_REQUEST):

- **Write requests**: $1.25 per 1 million write request units
- **Read requests**: $0.25 per 1 million read request units
- **Storage**: $0.25 per GB-month

**Typical usage** (per analysis):
- 1 write to Analysis table (1 WRU)
- 100 reads from Messages table (100 RRUs)

**Example calculation** (1,000 analyses per month):
```
Write cost: 1,000 × 1 WRU × $1.25 / 1M = $0.00125
Read cost:  1,000 × 100 RRU × $0.25 / 1M = $0.025
Storage:    1 GB × $0.25 = $0.25
Total DynamoDB cost:        $0.27
```

### 4. CloudWatch Pricing

CloudWatch charges for logs, metrics, and alarms:

- **Logs ingestion**: $0.50 per GB
- **Logs storage**: $0.03 per GB-month
- **Custom metrics**: $0.30 per metric per month
- **Alarms**: $0.10 per alarm per month

**Typical usage** (per month):
- 5 GB logs ingested
- 5 custom metrics
- 3 alarms

**Example calculation**:
```
Logs ingestion: 5 GB × $0.50 = $2.50
Logs storage:   5 GB × $0.03 = $0.15
Metrics:        5 × $0.30 = $1.50
Alarms:         3 × $0.10 = $0.30
Total CloudWatch cost:      $4.45
```

### 5. EventBridge Pricing

EventBridge charges for custom events:

- **Custom events**: $1.00 per 1 million events
- **Typical usage**: 1 event per analysis job

**Example calculation** (1,000 analyses per month):
```
Event cost: 1,000 events × $1.00 / 1M = $0.001
```

## Total Cost Estimate

### Monthly Cost Breakdown (1,000 analyses)

| Service | Cost | Percentage |
|---------|------|------------|
| Bedrock (Haiku) | $15.00 | 73% |
| CloudWatch | $4.45 | 22% |
| Lambda | $0.50 | 2% |
| DynamoDB | $0.27 | 1% |
| EventBridge | $0.001 | <1% |
| **Total** | **$20.22** | **100%** |

### Cost Scaling

| Analyses/Month | Bedrock | Lambda | DynamoDB | CloudWatch | Total |
|----------------|---------|--------|----------|------------|-------|
| 100 | $1.50 | $0.05 | $0.03 | $4.45 | $6.03 |
| 1,000 | $15.00 | $0.50 | $0.27 | $4.45 | $20.22 |
| 10,000 | $150.00 | $5.00 | $2.70 | $10.00 | $167.70 |
| 100,000 | $1,500.00 | $50.00 | $27.00 | $50.00 | $1,627.00 |

**Key Insight**: Bedrock is the dominant cost driver (70-90% of total cost).

## Cost Optimization Strategies

### 1. Model Selection

Choose the right model for your use case:

| Model | Cost/Analysis | Quality | Speed | Best For |
|-------|---------------|---------|-------|----------|
| Titan Express | $0.011 | Good | Fast | High-volume, cost-sensitive |
| Claude Haiku | $0.015 | Better | Fast | **Recommended balance** |
| Claude Sonnet | $0.18 | Best | Moderate | High-quality requirements |

**Recommendation**: Start with Claude Haiku, upgrade to Sonnet only if quality issues arise.

### 2. Token Limit Configuration

Configure token limits to prevent runaway costs:

```typescript
// In backend/lib/analysis-stack.ts
const messageAnalyzer = new lambda.Function(this, 'MessageAnalyzer', {
  environment: {
    MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
    MAX_INPUT_TOKENS: '100000',  // Limit input tokens
    MAX_OUTPUT_TOKENS: '4096',   // Limit output tokens
    // ... other env vars
  },
});
```

**Recommended limits**:
- **Max input tokens**: 100,000 (prevents processing extremely large message sets)
- **Max output tokens**: 4,096 (sufficient for structured JSON output)

### 3. Message Filtering

Filter out low-value messages before analysis:

```typescript
// Example: Filter out very short messages
const filteredMessages = messages.filter(msg => 
  msg.content.length > 50 && // Minimum content length
  !msg.content.match(/^(ok|thanks|got it)$/i) // Exclude trivial responses
);
```

**Potential savings**: 20-30% reduction in token usage.

### 4. Batch Processing

Process multiple jobs in batches to reduce Lambda cold starts:

```typescript
// Future enhancement: Batch multiple jobs
const batchSize = 10;
const jobs = await getJobsToProcess(batchSize);
await Promise.all(jobs.map(job => analyzeJob(job)));
```

**Potential savings**: 10-15% reduction in Lambda costs.

### 5. CloudWatch Logs Optimization

Reduce log verbosity in production:

```typescript
// Use structured logging with appropriate levels
if (process.env.LOG_LEVEL === 'DEBUG') {
  console.debug('Detailed debug information', { /* ... */ });
}

// Always log errors and warnings
console.error('Error occurred', { /* ... */ });
```

**Recommended log retention**: 30 days (balance cost and debugging needs).

### 6. DynamoDB Optimization

Use efficient query patterns:

```typescript
// ✅ GOOD: Query with partition key
const result = await dynamodb.query({
  TableName: 'flow-recall-messages',
  KeyConditionExpression: 'jobId = :jobId',
  ExpressionAttributeValues: { ':jobId': jobId },
});

// ❌ BAD: Scan entire table (expensive)
const result = await dynamodb.scan({
  TableName: 'flow-recall-messages',
});
```

**Potential savings**: 90% reduction in read costs.

## Monitoring and Alerting

### CloudWatch Metrics

The feature emits custom metrics for monitoring:

#### 1. Bedrock Invocation Metrics

```typescript
// Metric: BedrockInvocationCount
// Dimensions: UserId, ModelId
// Unit: Count
await cloudwatch.putMetricData({
  Namespace: 'FlowRecall/BedrockAnalysis',
  MetricData: [{
    MetricName: 'BedrockInvocationCount',
    Value: 1,
    Unit: 'Count',
    Dimensions: [
      { Name: 'UserId', Value: userId },
      { Name: 'ModelId', Value: modelId },
    ],
  }],
});
```

**Use case**: Track Bedrock usage per user and model.

#### 2. Token Usage Metrics

```typescript
// Metric: BedrockTokensUsed
// Dimensions: UserId, TokenType (input/output)
// Unit: Count
await cloudwatch.putMetricData({
  Namespace: 'FlowRecall/BedrockAnalysis',
  MetricData: [
    {
      MetricName: 'BedrockTokensUsed',
      Value: inputTokens,
      Unit: 'Count',
      Dimensions: [
        { Name: 'UserId', Value: userId },
        { Name: 'TokenType', Value: 'input' },
      ],
    },
    {
      MetricName: 'BedrockTokensUsed',
      Value: outputTokens,
      Unit: 'Count',
      Dimensions: [
        { Name: 'UserId', Value: userId },
        { Name: 'TokenType', Value: 'output' },
      ],
    },
  ],
});
```

**Use case**: Calculate actual Bedrock costs per user.

#### 3. Analysis Completion Metrics

```typescript
// Metric: AnalysisCompleted
// Dimensions: UserId, AnalysisType
// Unit: Count
await cloudwatch.putMetricData({
  Namespace: 'FlowRecall/BedrockAnalysis',
  MetricData: [{
    MetricName: 'AnalysisCompleted',
    Value: 1,
    Unit: 'Count',
    Dimensions: [
      { Name: 'UserId', Value: userId },
      { Name: 'AnalysisType', Value: 'insights' },
    ],
  }],
});
```

**Use case**: Track successful analyses per user.

### CloudWatch Dashboards

Create a dashboard to visualize costs and usage:

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

const dashboard = new cloudwatch.Dashboard(this, 'BedrockAnalysisDashboard', {
  dashboardName: 'bedrock-analysis-monitoring',
});

// Add widgets
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Bedrock Invocations',
    left: [
      new cloudwatch.Metric({
        namespace: 'FlowRecall/BedrockAnalysis',
        metricName: 'BedrockInvocationCount',
        statistic: 'Sum',
      }),
    ],
  }),
  new cloudwatch.GraphWidget({
    title: 'Token Usage',
    left: [
      new cloudwatch.Metric({
        namespace: 'FlowRecall/BedrockAnalysis',
        metricName: 'BedrockTokensUsed',
        dimensionsMap: { TokenType: 'input' },
        statistic: 'Sum',
      }),
      new cloudwatch.Metric({
        namespace: 'FlowRecall/BedrockAnalysis',
        metricName: 'BedrockTokensUsed',
        dimensionsMap: { TokenType: 'output' },
        statistic: 'Sum',
      }),
    ],
  }),
  new cloudwatch.GraphWidget({
    title: 'Lambda Duration',
    left: [
      new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Duration',
        dimensionsMap: { FunctionName: messageAnalyzer.functionName },
        statistic: 'Average',
      }),
    ],
  }),
);
```

### CloudWatch Alarms

Set up alarms for cost anomalies:

#### 1. High Token Usage Alarm

```typescript
const highTokenUsageAlarm = new cloudwatch.Alarm(this, 'HighTokenUsageAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'FlowRecall/BedrockAnalysis',
    metricName: 'BedrockTokensUsed',
    statistic: 'Sum',
    period: cdk.Duration.hours(1),
  }),
  threshold: 1000000, // 1M tokens per hour
  evaluationPeriods: 1,
  alarmDescription: 'Alert when token usage exceeds 1M per hour',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
```

**Action**: Investigate potential runaway costs or abuse.

#### 2. High Invocation Rate Alarm

```typescript
const highInvocationAlarm = new cloudwatch.Alarm(this, 'HighInvocationAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'FlowRecall/BedrockAnalysis',
    metricName: 'BedrockInvocationCount',
    statistic: 'Sum',
    period: cdk.Duration.minutes(5),
  }),
  threshold: 100, // 100 invocations per 5 minutes
  evaluationPeriods: 2,
  alarmDescription: 'Alert when invocation rate is unusually high',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
```

**Action**: Check for unexpected traffic or retry loops.

#### 3. Lambda Error Rate Alarm

```typescript
const errorRateAlarm = new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Lambda',
    metricName: 'Errors',
    dimensionsMap: { FunctionName: messageAnalyzer.functionName },
    statistic: 'Sum',
    period: cdk.Duration.minutes(5),
  }),
  threshold: 5, // 5 errors per 5 minutes
  evaluationPeriods: 1,
  alarmDescription: 'Alert when Lambda error rate is high',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
```

**Action**: Investigate Lambda failures (may indicate Bedrock issues).

### AWS Cost Explorer

Use Cost Explorer to track actual costs:

1. Navigate to **AWS Cost Explorer** in the console
2. Filter by service: **Amazon Bedrock**, **AWS Lambda**, **DynamoDB**
3. Group by: **Service**, **Region**, **Usage Type**
4. Set time range: **Last 30 days**

**Recommended views**:
- Daily costs by service
- Monthly costs by usage type
- Cost forecast for next 30 days

### Billing Alerts

Set up billing alerts to prevent unexpected charges:

#### 1. AWS Budgets

```typescript
import * as budgets from 'aws-cdk-lib/aws-budgets';

new budgets.CfnBudget(this, 'BedrockAnalysisBudget', {
  budget: {
    budgetName: 'bedrock-analysis-monthly-budget',
    budgetType: 'COST',
    timeUnit: 'MONTHLY',
    budgetLimit: {
      amount: 100, // $100 per month
      unit: 'USD',
    },
  },
  notificationsWithSubscribers: [
    {
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold: 80, // Alert at 80% of budget
      },
      subscribers: [
        {
          subscriptionType: 'EMAIL',
          address: 'alerts@example.com',
        },
      ],
    },
  ],
});
```

#### 2. CloudWatch Billing Alarm

```typescript
const billingAlarm = new cloudwatch.Alarm(this, 'BillingAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Billing',
    metricName: 'EstimatedCharges',
    dimensionsMap: { Currency: 'USD' },
    statistic: 'Maximum',
    period: cdk.Duration.hours(6),
  }),
  threshold: 100, // $100 total estimated charges
  evaluationPeriods: 1,
  alarmDescription: 'Alert when estimated charges exceed $100',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
```

## Cost Analysis Queries

### CloudWatch Logs Insights Queries

#### 1. Calculate Token Usage by User

```
fields @timestamp, userId, inputTokens, outputTokens
| filter @message like /Token usage/
| stats sum(inputTokens) as totalInput, sum(outputTokens) as totalOutput by userId
| sort totalInput desc
```

#### 2. Calculate Estimated Bedrock Cost

```
fields @timestamp, userId, inputTokens, outputTokens
| filter @message like /Token usage/
| stats sum(inputTokens) as totalInput, sum(outputTokens) as totalOutput by userId
| eval inputCost = totalInput * 0.25 / 1000000
| eval outputCost = totalOutput * 1.25 / 1000000
| eval totalCost = inputCost + outputCost
| sort totalCost desc
```

#### 3. Identify High-Cost Analyses

```
fields @timestamp, jobId, inputTokens, outputTokens
| filter @message like /Token usage/
| eval totalTokens = inputTokens + outputTokens
| filter totalTokens > 50000
| sort totalTokens desc
| limit 20
```

### DynamoDB Query for Cost Analysis

```typescript
// Query analyses by user to calculate costs
const result = await dynamodb.query({
  TableName: 'bedrock-analysis',
  IndexName: 'UserIdCreatedAtIndex',
  KeyConditionExpression: 'userId = :userId AND createdAt BETWEEN :start AND :end',
  ExpressionAttributeValues: {
    ':userId': userId,
    ':start': startDate,
    ':end': endDate,
  },
});

// Calculate total analyses per user
const analysisCount = result.Items.length;
const estimatedCost = analysisCount * 0.015; // $0.015 per analysis (Haiku)
```

## Token Limit Recommendations

### Per-Invocation Limits

| Message Count | Input Tokens | Output Tokens | Total Cost (Haiku) |
|---------------|--------------|---------------|--------------------|
| 10 | 5,000 | 500 | $0.0019 |
| 50 | 25,000 | 1,500 | $0.0081 |
| 100 | 50,000 | 2,000 | $0.0150 |
| 500 | 250,000 | 5,000 | $0.0688 |
| 1,000 | 500,000 | 10,000 | $0.1375 |

**Recommendations**:
- **Typical use case**: 100 messages → 50K input tokens, 2K output tokens
- **Max recommended**: 500 messages → 250K input tokens, 5K output tokens
- **Hard limit**: 1,000 messages → 500K input tokens, 10K output tokens

### Implementation

```typescript
// In Lambda function
const MAX_MESSAGES = 500; // Limit messages per analysis
const MAX_INPUT_TOKENS = 250000; // Limit input tokens
const MAX_OUTPUT_TOKENS = 5000; // Limit output tokens

if (messages.length > MAX_MESSAGES) {
  console.warn('Message count exceeds limit', {
    messageCount: messages.length,
    limit: MAX_MESSAGES,
  });
  messages = messages.slice(0, MAX_MESSAGES);
}

// Configure Bedrock client with token limits
const bedrockClient = new BedrockClient({
  modelId: process.env.MODEL_ID!,
  maxTokens: MAX_OUTPUT_TOKENS,
});
```

## Cost Optimization Checklist

Before deploying to production:

- [ ] Model selection optimized for use case (Haiku recommended)
- [ ] Token limits configured (100K input, 4K output)
- [ ] Message filtering implemented (exclude trivial messages)
- [ ] CloudWatch Logs retention set to 30 days
- [ ] CloudWatch metrics enabled for token usage
- [ ] CloudWatch alarms configured for high usage
- [ ] AWS Budgets configured with email alerts
- [ ] Cost Explorer dashboard created
- [ ] DynamoDB queries use partition keys (no scans)
- [ ] Lambda memory optimized (512 MB recommended)

## Additional Resources

- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [AWS Cost Management](https://aws.amazon.com/aws-cost-management/)
- [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/)


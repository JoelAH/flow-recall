# Operational Runbook: Bedrock Message Analysis

This runbook provides operational guidance for monitoring, troubleshooting, and maintaining the Bedrock Message Analysis feature in production.

## Overview

The Bedrock Message Analysis feature consists of two Lambda functions (Message_Analyzer and Timeline_Generator) that process messages using Amazon Bedrock. This runbook covers common operational scenarios, debugging procedures, and maintenance tasks.

## Quick Reference

### Key Resources

| Resource | Name/Pattern | Purpose |
|----------|--------------|---------|
| Lambda Functions | `bedrock-analysis-message-analyzer`<br>`bedrock-analysis-timeline-generator` | Message processing |
| DynamoDB Tables | `flow-recall-messages`<br>`bedrock-analysis` | Message storage and analysis results |
| CloudWatch Log Groups | `/aws/lambda/bedrock-analysis-*` | Function logs |
| EventBridge Rule | `bedrock-analysis-trigger` | Job completion events |
| IAM Role | `BedrockAnalysisExecutionRole` | Lambda permissions |

### Key Metrics

| Metric | Namespace | Normal Range | Alert Threshold |
|--------|-----------|--------------|-----------------|
| BedrockInvocationCount | FlowRecall/BedrockAnalysis | 0-1000/hour | >1000/hour |
| BedrockTokensUsed | FlowRecall/BedrockAnalysis | 0-1M/hour | >1M/hour |
| Lambda Duration | AWS/Lambda | 10-60 seconds | >120 seconds |
| Lambda Errors | AWS/Lambda | 0-5/hour | >10/hour |

## Common Error Scenarios

### 1. Bedrock Access Denied

**Symptoms**:
- Lambda function fails with "Access Denied" error
- CloudWatch Logs show `bedrock:InvokeModel` permission error
- Metric: `BedrockInvocationFailed` with `ErrorType=AUTH`

**Root Causes**:
- Model access not approved in Bedrock console
- IAM role missing `bedrock:InvokeModel` permission
- Incorrect region configuration

**Resolution Steps**:

1. **Verify Bedrock model access**:
```bash
aws bedrock list-foundation-models \
  --region us-east-1 \
  --query "modelSummaries[?modelId=='anthropic.claude-3-haiku-20240307-v1:0']"
```

2. **Check IAM role permissions**:
```bash
# Get Lambda function configuration
aws lambda get-function-configuration \
  --function-name bedrock-analysis-message-analyzer \
  --query 'Role'

# Check role policies
aws iam list-attached-role-policies \
  --role-name BedrockAnalysisExecutionRole

# Get inline policies
aws iam list-role-policies \
  --role-name BedrockAnalysisExecutionRole
```

3. **Verify model access in console**:
   - Navigate to AWS Console → Amazon Bedrock → Model access
   - Ensure Claude 3 Haiku shows "Access granted"
   - If not, request access and wait for approval

4. **Test Bedrock access manually**:
```bash
aws bedrock-runtime invoke-model \
  --region us-east-1 \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"test"}]}' \
  --cli-binary-format raw-in-base64-out \
  output.json
```

**Prevention**:
- Document model access setup in deployment guide
- Add pre-deployment validation script
- Set up CloudWatch alarm for AUTH errors

---

### 2. Bedrock Rate Limit Exceeded

**Symptoms**:
- Lambda function fails with rate limit error
- CloudWatch Logs show "ThrottlingException" or 429 status
- Metric: `BedrockInvocationFailed` with `ErrorType=RATE_LIMIT`

**Root Causes**:
- Too many concurrent Lambda invocations
- Bedrock quota exceeded for account/region
- Retry loop causing exponential requests

**Resolution Steps**:

1. **Check current invocation rate**:
```bash
# CloudWatch Logs Insights query
aws logs start-query \
  --log-group-name /aws/lambda/bedrock-analysis-message-analyzer \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp | filter @message like /rate limit/ | stats count() by bin(5m)'
```

2. **Check Bedrock quotas**:
```bash
# View service quotas
aws service-quotas list-service-quotas \
  --service-code bedrock \
  --query 'Quotas[?QuotaName==`InvokeModel requests per minute`]'
```

3. **Reduce concurrent executions** (temporary):
```bash
# Set reserved concurrency to limit parallel invocations
aws lambda put-function-concurrency \
  --function-name bedrock-analysis-message-analyzer \
  --reserved-concurrent-executions 10
```

4. **Request quota increase**:
   - Navigate to AWS Console → Service Quotas → Amazon Bedrock
   - Request increase for "InvokeModel requests per minute"
   - Typical approval time: 1-2 business days

**Prevention**:
- Implement exponential backoff in Lambda function
- Set Lambda reserved concurrency limits
- Monitor invocation rate with CloudWatch alarms
- Consider batching requests during high-volume periods

---

### 3. Bedrock Timeout

**Symptoms**:
- Lambda function times out after 5 minutes
- CloudWatch Logs show incomplete processing
- Metric: `BedrockInvocationFailed` with `ErrorType=TIMEOUT`

**Root Causes**:
- Large message sets (>500 messages)
- Bedrock API slow response
- Network connectivity issues

**Resolution Steps**:

1. **Check message count for failed jobs**:
```bash
# CloudWatch Logs Insights query
aws logs start-query \
  --log-group-name /aws/lambda/bedrock-analysis-message-analyzer \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp, jobId, messageCount | filter @message like /timeout/ | sort @timestamp desc | limit 20'
```

2. **Identify large message sets**:
```bash
# Query DynamoDB for message counts
aws dynamodb query \
  --table-name flow-recall-messages \
  --index-name JobIdTimestampIndex \
  --key-condition-expression "jobId = :jobId" \
  --expression-attribute-values '{":jobId":{"S":"<job-id>"}}' \
  --select COUNT
```

3. **Increase Lambda timeout** (if needed):
```typescript
// In CDK stack
const messageAnalyzer = new lambda.Function(this, 'MessageAnalyzer', {
  timeout: cdk.Duration.minutes(10), // Increase from 5 to 10 minutes
  // ... other config
});
```

4. **Implement message batching** (future enhancement):
```typescript
// Split large message sets into batches
const BATCH_SIZE = 100;
const batches = chunk(messages, BATCH_SIZE);
for (const batch of batches) {
  await analyzeMessages(batch);
}
```

**Prevention**:
- Set maximum message count per analysis (500 recommended)
- Monitor Lambda duration metric
- Implement message filtering to reduce token count
- Consider Step Functions for long-running workflows

---

### 4. Invalid JSON Response from Bedrock

**Symptoms**:
- Lambda function fails with JSON parsing error
- CloudWatch Logs show "Unexpected token" or "Invalid JSON"
- Metric: `JSONParsingFailed`

**Root Causes**:
- Bedrock returned malformed JSON
- Prompt engineering issue
- Model hallucination or formatting error

**Resolution Steps**:

1. **Retrieve failed response from logs**:
```bash
# CloudWatch Logs Insights query
aws logs start-query \
  --log-group-name /aws/lambda/bedrock-analysis-message-analyzer \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string 'fields @timestamp, jobId, bedrockResponse | filter @message like /Invalid JSON/ | sort @timestamp desc | limit 10'
```

2. **Analyze response format**:
   - Check if response contains markdown code blocks (```json)
   - Check for trailing commas or missing brackets
   - Check for escaped characters or encoding issues

3. **Test prompt with Bedrock console**:
   - Navigate to AWS Console → Amazon Bedrock → Playgrounds
   - Use the same prompt from logs
   - Verify JSON output format

4. **Update prompt engineering** (if needed):
```typescript
// Add explicit JSON formatting instructions
const systemPrompt = `
You are an AI assistant that analyzes messages.
CRITICAL: Return ONLY valid JSON. Do not include markdown code blocks.
Do not include any text before or after the JSON object.
`;
```

**Prevention**:
- Add JSON validation before parsing
- Implement retry logic with prompt refinement
- Use structured output features (if available in model)
- Add property tests for JSON round-trip validation

---

### 5. DynamoDB Access Denied

**Symptoms**:
- Lambda function fails when reading Messages table
- Lambda function fails when writing to Analysis table
- CloudWatch Logs show "AccessDeniedException"

**Root Causes**:
- IAM role missing DynamoDB permissions
- Table name mismatch in environment variables
- Table doesn't exist in region

**Resolution Steps**:

1. **Verify table exists**:
```bash
# Check Messages table
aws dynamodb describe-table \
  --table-name flow-recall-messages \
  --query 'Table.[TableName,TableStatus]'

# Check Analysis table
aws dynamodb describe-table \
  --table-name bedrock-analysis \
  --query 'Table.[TableName,TableStatus]'
```

2. **Check Lambda environment variables**:
```bash
aws lambda get-function-configuration \
  --function-name bedrock-analysis-message-analyzer \
  --query 'Environment.Variables'
```

3. **Verify IAM permissions**:
```bash
# Get role policies
aws iam get-role-policy \
  --role-name BedrockAnalysisExecutionRole \
  --policy-name DynamoDBAccess
```

4. **Test DynamoDB access manually**:
```bash
# Test read access
aws dynamodb query \
  --table-name flow-recall-messages \
  --key-condition-expression "jobId = :jobId" \
  --expression-attribute-values '{":jobId":{"S":"test-job-id"}}' \
  --limit 1

# Test write access
aws dynamodb put-item \
  --table-name bedrock-analysis \
  --item '{"analysisId":{"S":"test-id"},"jobId":{"S":"test-job"}}'
```

**Prevention**:
- Use CDK grants for automatic permission management
- Add pre-deployment validation for table existence
- Set up CloudWatch alarm for DynamoDB errors

---

### 6. EventBridge Trigger Not Firing

**Symptoms**:
- Message ingestion completes but analysis doesn't start
- No Lambda invocations in CloudWatch metrics
- EventBridge rule shows no matches

**Root Causes**:
- Event pattern mismatch
- EventBridge rule disabled
- Lambda target not configured correctly

**Resolution Steps**:

1. **Check EventBridge rule status**:
```bash
aws events describe-rule \
  --name bedrock-analysis-trigger \
  --query '[Name,State,EventPattern]'
```

2. **Verify event pattern matches**:
```bash
# List recent events
aws events test-event-pattern \
  --event-pattern '{"source":["flow-recall.data-ingestion"],"detail-type":["Job Completed"]}' \
  --event '{"source":"flow-recall.data-ingestion","detail-type":"Job Completed","detail":{"jobId":"test","status":"DONE"}}'
```

3. **Check Lambda targets**:
```bash
aws events list-targets-by-rule \
  --rule bedrock-analysis-trigger
```

4. **Manually trigger Lambda for testing**:
```bash
aws lambda invoke \
  --function-name bedrock-analysis-message-analyzer \
  --payload '{"jobId":"test-job-id","userId":"test-user","messageCount":10,"completedAt":"2024-01-01T00:00:00Z"}' \
  response.json

cat response.json
```

**Prevention**:
- Add integration tests for EventBridge triggers
- Monitor EventBridge invocation metrics
- Set up CloudWatch alarm for zero invocations

## CloudWatch Logs Insights Queries

### Query 1: Recent Errors

```
fields @timestamp, @message, jobId, userId, errorType
| filter @message like /ERROR/ or level = "ERROR"
| sort @timestamp desc
| limit 50
```

**Use case**: Quick overview of recent errors across all Lambda functions.

---

### Query 2: Token Usage by User

```
fields @timestamp, userId, inputTokens, outputTokens
| filter @message like /Token usage/
| stats sum(inputTokens) as totalInput, sum(outputTokens) as totalOutput by userId
| eval inputCost = totalInput * 0.25 / 1000000
| eval outputCost = totalOutput * 1.25 / 1000000
| eval totalCost = inputCost + outputCost
| sort totalCost desc
```

**Use case**: Calculate Bedrock costs per user for billing or optimization.

---

### Query 3: Slow Invocations

```
fields @timestamp, jobId, @duration
| filter @type = "REPORT"
| filter @duration > 60000
| sort @duration desc
| limit 20
```

**Use case**: Identify Lambda invocations taking longer than 60 seconds.

---

### Query 4: Bedrock Invocation Failures

```
fields @timestamp, jobId, userId, errorType, errorMessage
| filter @message like /Bedrock invocation failed/
| stats count() by errorType
| sort count desc
```

**Use case**: Analyze Bedrock failure patterns by error type.

---

### Query 5: Message Retrieval Statistics

```
fields @timestamp, jobId, messageCount
| filter @message like /Retrieved messages/
| stats avg(messageCount) as avgMessages, max(messageCount) as maxMessages, min(messageCount) as minMessages
```

**Use case**: Understand typical message set sizes for capacity planning.

---

### Query 6: Analysis Completion Rate

```
fields @timestamp, jobId
| filter @message like /Analysis completed/ or @message like /Analysis failed/
| stats count(@message) as total by @message
```

**Use case**: Calculate success rate for analyses.

---

### Query 7: High Token Usage Analyses

```
fields @timestamp, jobId, inputTokens, outputTokens
| filter @message like /Token usage/
| eval totalTokens = inputTokens + outputTokens
| filter totalTokens > 100000
| sort totalTokens desc
| limit 20
```

**Use case**: Identify analyses consuming excessive tokens (potential cost optimization).

## Manual Testing Procedures

### Test 1: Trigger Analysis Manually

**Purpose**: Verify end-to-end analysis workflow.

**Steps**:

1. **Create test event**:
```json
{
  "jobId": "test-job-123",
  "userId": "test-user",
  "messageCount": 10,
  "completedAt": "2024-01-01T00:00:00Z"
}
```

2. **Invoke Message_Analyzer**:
```bash
aws lambda invoke \
  --function-name bedrock-analysis-message-analyzer \
  --payload file://test-event.json \
  response.json

cat response.json
```

3. **Check CloudWatch Logs**:
```bash
aws logs tail /aws/lambda/bedrock-analysis-message-analyzer --follow
```

4. **Verify Analysis table**:
```bash
aws dynamodb query \
  --table-name bedrock-analysis \
  --index-name JobIdCreatedAtIndex \
  --key-condition-expression "jobId = :jobId" \
  --expression-attribute-values '{":jobId":{"S":"test-job-123"}}'
```

**Expected Result**: Analysis record created with insights and timeline.

---

### Test 2: Verify Bedrock Access

**Purpose**: Confirm Bedrock model access and permissions.

**Steps**:

1. **Test model invocation**:
```bash
aws bedrock-runtime invoke-model \
  --region us-east-1 \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Extract insights from: Meeting scheduled for tomorrow at 2pm"}]}' \
  --cli-binary-format raw-in-base64-out \
  output.json

cat output.json | jq '.content[0].text'
```

**Expected Result**: JSON response with extracted insights.

---

### Test 3: Query Analysis Results

**Purpose**: Verify analysis results are stored correctly.

**Steps**:

1. **Query by job ID**:
```bash
aws dynamodb query \
  --table-name bedrock-analysis \
  --index-name JobIdCreatedAtIndex \
  --key-condition-expression "jobId = :jobId" \
  --expression-attribute-values '{":jobId":{"S":"<job-id>"}}' \
  --output json | jq '.Items[0]'
```

2. **Query by user ID**:
```bash
aws dynamodb query \
  --table-name bedrock-analysis \
  --index-name UserIdCreatedAtIndex \
  --key-condition-expression "userId = :userId" \
  --expression-attribute-values '{":userId":{"S":"<user-id>"}}' \
  --output json | jq '.Items | length'
```

**Expected Result**: Analysis records with decisions, risks, tasks, deadlines, and timeline.

## Monitoring Dashboard

### Recommended CloudWatch Dashboard Widgets

1. **Lambda Invocations** (Line graph)
   - Metric: `AWS/Lambda` → `Invocations`
   - Dimensions: FunctionName
   - Statistic: Sum
   - Period: 5 minutes

2. **Lambda Errors** (Line graph)
   - Metric: `AWS/Lambda` → `Errors`
   - Dimensions: FunctionName
   - Statistic: Sum
   - Period: 5 minutes

3. **Lambda Duration** (Line graph)
   - Metric: `AWS/Lambda` → `Duration`
   - Dimensions: FunctionName
   - Statistic: Average, p99
   - Period: 5 minutes

4. **Bedrock Token Usage** (Stacked area)
   - Metric: `FlowRecall/BedrockAnalysis` → `BedrockTokensUsed`
   - Dimensions: TokenType (input/output)
   - Statistic: Sum
   - Period: 1 hour

5. **Bedrock Invocation Count** (Number)
   - Metric: `FlowRecall/BedrockAnalysis` → `BedrockInvocationCount`
   - Statistic: Sum
   - Period: 1 day

6. **Error Rate** (Gauge)
   - Metric: `AWS/Lambda` → `Errors` / `Invocations`
   - Statistic: Average
   - Period: 5 minutes

### Creating the Dashboard

```bash
# Create dashboard from JSON definition
aws cloudwatch put-dashboard \
  --dashboard-name bedrock-analysis-monitoring \
  --dashboard-body file://dashboard-definition.json
```

## Maintenance Tasks

### Daily Tasks

- [ ] Check CloudWatch alarms for any triggered alerts
- [ ] Review error logs for new error patterns
- [ ] Monitor Bedrock token usage for cost anomalies

### Weekly Tasks

- [ ] Review Lambda duration trends for performance degradation
- [ ] Analyze token usage by user for optimization opportunities
- [ ] Check DynamoDB table sizes and adjust capacity if needed
- [ ] Review CloudWatch Logs retention and adjust if needed

### Monthly Tasks

- [ ] Review AWS Cost Explorer for Bedrock costs
- [ ] Analyze error patterns and implement fixes
- [ ] Update documentation based on operational learnings
- [ ] Review and update CloudWatch alarms thresholds
- [ ] Conduct disaster recovery drill (restore from backup)

### Quarterly Tasks

- [ ] Review IAM permissions for least-privilege compliance
- [ ] Update Bedrock model version if new versions available
- [ ] Conduct security audit of Lambda functions
- [ ] Review and optimize CloudWatch Logs retention policies
- [ ] Update operational runbook based on incidents

## Escalation Procedures

### Level 1: On-Call Engineer

**Responsibilities**:
- Monitor CloudWatch alarms
- Investigate and resolve common errors
- Follow runbook procedures
- Document incidents

**Escalation Criteria**:
- Unable to resolve within 30 minutes
- Multiple services affected
- Data loss or corruption suspected

### Level 2: Senior Engineer

**Responsibilities**:
- Complex troubleshooting
- Code changes or hotfixes
- Architecture decisions
- Coordinate with AWS Support

**Escalation Criteria**:
- AWS service outage suspected
- Security incident
- Data breach or compliance issue

### Level 3: AWS Support

**Contact**: AWS Support Console

**Escalation Criteria**:
- Bedrock service issues
- DynamoDB performance problems
- IAM or security issues
- Quota increase requests

## Disaster Recovery

### Backup Strategy

**DynamoDB**:
- Point-in-time recovery enabled (35 days)
- On-demand backups before major changes

**Lambda**:
- Code stored in version control (Git)
- CDK infrastructure as code

**CloudWatch Logs**:
- 30-day retention configured
- Export to S3 for long-term storage (optional)

### Recovery Procedures

**Scenario 1: Accidental Table Deletion**

1. **Restore from point-in-time recovery**:
```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name bedrock-analysis \
  --target-table-name bedrock-analysis-restored \
  --restore-date-time 2024-01-01T00:00:00Z
```

2. **Update Lambda environment variables** to point to restored table

3. **Verify data integrity** with sample queries

**Scenario 2: Lambda Function Corruption**

1. **Redeploy from CDK**:
```bash
cd backend
npm run cdk:deploy
```

2. **Verify function configuration**:
```bash
aws lambda get-function-configuration \
  --function-name bedrock-analysis-message-analyzer
```

3. **Test with manual invocation**

## Additional Resources

- [AWS Lambda Troubleshooting Guide](https://docs.aws.amazon.com/lambda/latest/dg/lambda-troubleshooting.html)
- [Amazon Bedrock Troubleshooting](https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting.html)
- [DynamoDB Troubleshooting](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.Errors.html)
- [CloudWatch Logs Insights Query Syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)

## Support Contacts

- **AWS Support**: AWS Support Console
- **Internal Team**: [Slack channel or email]
- **On-Call Rotation**: [PagerDuty or similar]


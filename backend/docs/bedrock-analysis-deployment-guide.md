# Bedrock Message Analysis - Deployment Guide

This guide provides step-by-step instructions for deploying the Bedrock Message Analysis feature to AWS.

## Overview

The Bedrock Message Analysis feature consists of:
- **Message_Analyzer Lambda**: Extracts insights (decisions, risks, tasks, deadlines) from messages
- **Timeline_Generator Lambda**: Constructs chronological event timelines
- **Analysis DynamoDB Table**: Stores structured analysis results
- **EventBridge Rules**: Triggers analysis when message ingestion completes
- **IAM Roles**: Provides Lambda functions access to Bedrock and DynamoDB

## Prerequisites

### 1. Node.js 22.x

This project requires Node.js 22.x. Verify your version:

```bash
node --version
# Should output: v22.x.x
```

If you need to switch versions:

```bash
nvm use 22
# or install if not present
nvm install 22
nvm use 22
```

### 2. AWS CLI

Install and configure the AWS CLI:

```bash
aws --version
# Should output: aws-cli/2.x.x or higher

# Configure credentials
aws configure
```

### 3. AWS CDK Bootstrap

Ensure your AWS account is bootstrapped for CDK:

```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 4. Bedrock Model Access

**CRITICAL**: You must request Bedrock model access before deployment. See [Bedrock Model Access Setup Guide](./bedrock-model-access-setup.md) for detailed instructions.

Quick steps:
1. Go to AWS Console → Amazon Bedrock → Model access
2. Request access to **Claude 3 Haiku** (`anthropic.claude-3-haiku-20240307-v1:0`)
3. Wait for approval (usually immediate)

## Deployment Steps

### Step 1: Pre-Deployment Validation

Run the validation script to check all prerequisites:

```bash
cd backend
npm run validate:deployment
```

This checks:
- ✅ Node.js 22.x is installed
- ✅ AWS credentials are configured
- ✅ CDK bootstrap status
- ✅ Lambda functions are built
- ⚠️ Bedrock model access (informational)

**If validation fails**, fix the reported issues before proceeding.

### Step 2: Build Lambda Functions

Compile TypeScript to JavaScript:

```bash
cd backend
npm run build
```

This compiles:
- `lambda/bedrock-analysis/message-analyzer/index.ts` → `index.js`
- `lambda/bedrock-analysis/timeline-generator/index.ts` → `index.js`
- `lambda/bedrock-analysis/shared/*.ts` → `*.js`

### Step 3: Deploy Infrastructure

Deploy the CDK stack with automatic validation:

```bash
cd backend
npm run deploy:analysis
```

This command:
1. Runs pre-deployment validation (`predeploy:analysis`)
2. Builds Lambda functions (`npm run build`)
3. Deploys CDK stack (`npx cdk deploy --all`)
4. Runs post-deployment smoke tests (`postdeploy:analysis`)

**Expected output:**
```
═══════════════════════════════════════════════════════
  Bedrock Message Analysis - Pre-Deployment Validation
═══════════════════════════════════════════════════════

🔍 Checking Node.js version...
✅ Node.js version v22.x.x is correct

🔍 Checking AWS credentials...
✅ AWS credentials valid
   Account: 123456789012
   User/Role: arn:aws:iam::123456789012:user/developer

🔍 Checking CDK bootstrap status...
⚠️  Ensure your AWS account is CDK bootstrapped
   If not, run: npx cdk bootstrap

🔍 Checking build status...
✅ All Lambda functions are built

🔍 Checking Bedrock model access...
⚠️  MANUAL STEP REQUIRED: Bedrock model access must be configured
   1. Go to AWS Console → Amazon Bedrock → Model access
   2. Request access to: Claude 3 Haiku
   3. Wait for approval (usually immediate)
   4. Verify model ID is configured in CDK stack

═══════════════════════════════════════════════════════
✅ All validation checks passed!
   Ready to deploy with: npm run deploy:analysis
═══════════════════════════════════════════════════════

[CDK deployment output...]

BackendStack: deploying...
BackendStack: creating CloudFormation changeset...
 ✅  BackendStack

Outputs:
BackendStack.AnalysisTableName = bedrock-analysis
BackendStack.MessageAnalyzerFunctionName = BackendStack-MessageAnalyzer-ABC123
BackendStack.TimelineGeneratorFunctionName = BackendStack-TimelineGenerator-XYZ789

Stack ARN:
arn:aws:cloudformation:us-east-1:123456789012:stack/BackendStack/...

═══════════════════════════════════════════════════════
  Bedrock Message Analysis - Post-Deployment Smoke Tests
═══════════════════════════════════════════════════════

🔍 Getting CloudFormation stack outputs: BackendStack...
✅ Stack BackendStack status: CREATE_COMPLETE
   Outputs:
     AnalysisTableName: bedrock-analysis
     MessageAnalyzerFunctionName: BackendStack-MessageAnalyzer-ABC123
     TimelineGeneratorFunctionName: BackendStack-TimelineGenerator-XYZ789

🔍 Checking DynamoDB table: bedrock-analysis...
✅ Table bedrock-analysis is ACTIVE
   Items: 0
   GSIs: 2
     - JobIdCreatedAtIndex: ACTIVE
     - UserIdCreatedAtIndex: ACTIVE

🔍 Checking Lambda function: BackendStack-MessageAnalyzer-ABC123...
✅ Function BackendStack-MessageAnalyzer-ABC123 exists
   Runtime: nodejs22.x
   Memory: 512 MB
   Timeout: 300 seconds

🔍 Checking Lambda function: BackendStack-TimelineGenerator-XYZ789...
✅ Function BackendStack-TimelineGenerator-XYZ789 exists
   Runtime: nodejs22.x
   Memory: 512 MB
   Timeout: 300 seconds

═══════════════════════════════════════════════════════
✅ All smoke tests passed!
   Bedrock Message Analysis feature is deployed successfully.

📝 Next steps:
   1. Verify Bedrock model access in AWS Console
   2. Test with a sample job completion event
   3. Check CloudWatch Logs for Lambda execution
═══════════════════════════════════════════════════════
```

### Step 4: Verify Deployment

Run smoke tests independently to verify deployment:

```bash
cd backend
npm run smoke:test
```

## Manual Deployment (Alternative)

If you prefer manual control over each step:

```bash
cd backend

# 1. Validate prerequisites
npm run validate:deployment

# 2. Build Lambda functions
npm run build

# 3. Deploy CDK stack
npx cdk deploy --all

# 4. Run smoke tests
npm run smoke:test
```

## Configuration

### Model Selection

The default model is **Claude 3 Haiku** for cost-effectiveness. To change models:

1. Edit `backend/lib/backend-stack.ts` (or your analysis stack file)
2. Update the `MODEL_ID` environment variable:

```typescript
const messageAnalyzer = new lambda.Function(this, 'MessageAnalyzer', {
  // ... other config
  environment: {
    MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0', // Change here
    MESSAGES_TABLE_NAME: messagesTable.tableName,
    ANALYSIS_TABLE_NAME: analysisTable.tableName,
  },
});
```

3. Ensure you have access to the new model in Bedrock
4. Redeploy: `npm run deploy:analysis`

See [Bedrock Model Access Setup Guide](./bedrock-model-access-setup.md) for model options.

### Region Configuration

To deploy to a different region:

```bash
export AWS_REGION=us-west-2
npm run deploy:analysis
```

Or set the region in your CDK stack:

```typescript
const app = new cdk.App();
new BackendStack(app, 'BackendStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2', // Specify region
  },
});
```

## Testing the Deployment

### 1. Verify Bedrock Access

Test Bedrock invocation directly:

```bash
aws bedrock-runtime invoke-model \
  --region us-east-1 \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}' \
  --cli-binary-format raw-in-base64-out \
  output.json

cat output.json
```

### 2. Trigger Analysis with Test Event

Create a test event file `test-event.json`:

```json
{
  "jobId": "test-job-123",
  "userId": "test-user-456",
  "messageCount": 5,
  "completedAt": "2024-03-15T10:30:00Z"
}
```

Invoke Message_Analyzer:

```bash
aws lambda invoke \
  --function-name BackendStack-MessageAnalyzer-ABC123 \
  --payload file://test-event.json \
  response.json

cat response.json
```

### 3. Check CloudWatch Logs

View Lambda execution logs:

```bash
# Get log group name
aws logs describe-log-groups \
  --log-group-name-prefix /aws/lambda/BackendStack-MessageAnalyzer

# Tail logs
aws logs tail /aws/lambda/BackendStack-MessageAnalyzer-ABC123 --follow
```

### 4. Query Analysis Results

Check DynamoDB for analysis results:

```bash
aws dynamodb scan \
  --table-name bedrock-analysis \
  --limit 10
```

## Monitoring

### CloudWatch Metrics

Key metrics to monitor:
- `BedrockInvocationFailed` - Bedrock API failures
- `MessageRetrievalFailed` - DynamoDB query failures
- `AnalysisStorageFailed` - DynamoDB write failures
- `JSONParsingFailed` - Invalid Bedrock responses

### CloudWatch Logs Insights Queries

**Find all errors:**
```
fields @timestamp, component, errorType, errorMessage, jobId, userId
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

**Track Bedrock invocations:**
```
fields @timestamp, jobId, userId, messageCount
| filter component = "Message_Analyzer" or component = "Timeline_Generator"
| stats count() by component
```

**Analyze error types:**
```
fields @timestamp, errorType
| filter level = "ERROR"
| stats count() by errorType
```

## Troubleshooting

### Deployment Fails: "Access denied to model"

**Cause**: Bedrock model access not approved

**Solution**:
1. Go to AWS Console → Amazon Bedrock → Model access
2. Verify Claude 3 Haiku is approved
3. Check IAM role has `bedrock:InvokeModel` permission

### Smoke Tests Fail: "Table not found"

**Cause**: DynamoDB table not created or wrong table name

**Solution**:
1. Check CloudFormation stack outputs for table name
2. Verify table exists: `aws dynamodb describe-table --table-name bedrock-analysis`
3. Check CDK stack deployed successfully

### Lambda Invocation Fails: "Module not found"

**Cause**: Lambda functions not built before deployment

**Solution**:
1. Run `npm run build` in backend directory
2. Verify `.js` files exist in `lambda/bedrock-analysis/*/`
3. Redeploy: `npm run deploy:analysis`

### Pre-Deployment Validation Fails: "Node.js version incorrect"

**Cause**: Wrong Node.js version

**Solution**:
```bash
nvm use 22
# Then retry deployment
npm run deploy:analysis
```

## Rollback

To rollback the deployment:

```bash
cd backend
npm run cdk:destroy
```

This will:
1. Delete all Lambda functions
2. Delete the Analysis DynamoDB table (data will be lost!)
3. Delete EventBridge rules
4. Delete IAM roles

**Warning**: This is destructive and cannot be undone. Analysis data will be permanently deleted.

## Cost Estimation

### Lambda Costs
- **Invocations**: $0.20 per 1M requests
- **Duration**: $0.0000166667 per GB-second
- **Estimate**: ~$0.01 per 100 analyses (assuming 512MB, 30s duration)

### Bedrock Costs (Claude 3 Haiku)
- **Input tokens**: $0.25 per 1M tokens
- **Output tokens**: $1.25 per 1M tokens
- **Estimate**: ~$0.01 per analysis (50K input tokens, 2K output tokens)

### DynamoDB Costs
- **On-demand pricing**: $1.25 per million write requests, $0.25 per million read requests
- **Storage**: $0.25 per GB-month
- **Estimate**: ~$0.001 per analysis

### Total Estimated Cost
- **Per analysis**: ~$0.02
- **1,000 analyses/month**: ~$20/month
- **10,000 analyses/month**: ~$200/month

## Next Steps

After successful deployment:

1. ✅ Verify Bedrock model access
2. ✅ Test with sample events
3. ✅ Set up CloudWatch alarms
4. ✅ Configure billing alerts
5. ✅ Integrate with data ingestion pipeline
6. ✅ Test end-to-end workflow

## Additional Resources

- [Bedrock Model Access Setup Guide](./bedrock-model-access-setup.md)
- [Requirements Document](../.kiro/specs/bedrock-message-analysis/requirements.md)
- [Design Document](../.kiro/specs/bedrock-message-analysis/design.md)
- [Tasks Document](../.kiro/specs/bedrock-message-analysis/tasks.md)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

## Support

For issues or questions:
1. Check CloudWatch Logs for detailed error messages
2. Review the troubleshooting section above
3. Consult the design document for architecture details
4. Contact AWS Support for Bedrock-specific issues

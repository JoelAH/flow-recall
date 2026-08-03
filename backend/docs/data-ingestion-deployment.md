# Data Ingestion Pipeline Deployment Guide

## Prerequisites

1. Ensure Node.js 22.x is installed and active:
   ```bash
   nvm use 22
   ```

2. Ensure all dependencies are installed:
   ```bash
   npm install
   ```

3. Build the backend:
   ```bash
   npm run build:backend
   ```

## Deployment Steps

### 1. Deploy the CDK Stack

From the project root, deploy all stacks:

```bash
npm run deploy
```

Or deploy just the DataIngestionStack:

```bash
cd backend
npx cdk deploy DataIngestionStack
```

### 2. Capture the API Gateway URL

After deployment, the CDK will output the API Gateway endpoint URL. Look for:

```
DataIngestionStack.ApiEndpoint = https://{api-id}.execute-api.{region}.amazonaws.com/prod/
```

### 3. Configure Frontend Environment

Create a `.env` file in the `frontend/` directory:

```bash
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env` and set the API Gateway URL:

```
VITE_API_GATEWAY_URL=https://{api-id}.execute-api.{region}.amazonaws.com/prod/
```

Replace `{api-id}` and `{region}` with the values from the CDK output.

### 4. Verify Deployment

Check that all resources were created:

```bash
cd backend
npx cdk list
```

You should see:
- DatabaseStack
- AuthStack
- GmailIntegrationStack
- SlackIntegrationStack
- DataIngestionStack

### 5. Test the API

You can test the API endpoints using the frontend application or with curl:

```bash
# Get job status (requires authentication token)
curl -X GET \
  https://{api-id}.execute-api.{region}.amazonaws.com/prod/api/jobs/{jobId} \
  -H "Authorization: Bearer {id-token}"
```

## Stack Resources

The DataIngestionStack creates:

### DynamoDB Tables
- **jobs**: Stores job metadata and status
  - GSI: UserIdStatusIndex (for concurrent job counting)
  - GSI: UserIdCreatedAtIndex (for chronological listing)
- **messages**: Stores normalized message records
  - GSI: JobIdTimestampIndex (for chronological retrieval)
  - GSI: JobIdDeduplicationHashIndex (for deduplication)

### Lambda Functions
- **CreateJobFunction**: Validates input and creates job records
- **ProcessJobFunction**: Fetches messages from Gmail and Slack
- **GetStatusFunction**: Returns job status for polling

### API Gateway
- **POST /api/jobs**: Create a new data ingestion job
- **GET /api/jobs/{jobId}**: Get job status

### IAM Permissions
- CreateJobFunction: Read/write to Jobs table, invoke ProcessJobFunction
- ProcessJobFunction: Read/write to Jobs and Messages tables, read Users table, decrypt KMS keys, read SSM parameters, emit CloudWatch metrics
- GetStatusFunction: Read from Jobs table

### CloudWatch
- Log groups for all Lambda functions (1 week retention)
- Custom metrics for job processing

## Troubleshooting

### Deployment Fails

1. Check AWS credentials:
   ```bash
   aws sts get-caller-identity
   ```

2. Verify CDK bootstrap:
   ```bash
   cd backend
   npx cdk bootstrap
   ```

### API Returns 401 Unauthorized

- Verify the Cognito user pool is configured correctly
- Check that the frontend is sending the correct ID token
- Verify the token hasn't expired

### Lambda Timeout

- Check CloudWatch logs for the specific Lambda function
- Verify OAuth tokens are valid
- Check Gmail/Slack API rate limits

### CORS Errors

- Verify the API Gateway CORS configuration
- Check that the frontend is sending the correct headers
- Ensure the Authorization header is included in allowed headers

## Monitoring

### CloudWatch Logs

View logs for each Lambda function:

```bash
aws logs tail /aws/lambda/DataIngestionStack-CreateJobFunction --follow
aws logs tail /aws/lambda/DataIngestionStack-ProcessJobFunction --follow
aws logs tail /aws/lambda/DataIngestionStack-GetStatusFunction --follow
```

### CloudWatch Metrics

The ProcessJobFunction emits custom metrics:
- JobCreated
- JobCompleted
- JobFailed
- MessagesFetched
- MessagesDeduplicated
- APIRetries
- ProcessingDuration

View metrics in the CloudWatch console under Custom Namespaces.

## Cleanup

To remove all resources:

```bash
cd backend
npx cdk destroy DataIngestionStack
```

Note: DynamoDB tables have `RETAIN` removal policy and will not be deleted automatically.

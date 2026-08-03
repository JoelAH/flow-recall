# Slack Integration Deployment Guide

This guide walks through deploying the Slack integration feature to AWS.

## Prerequisites

1. **Node.js 22.x** installed and active:
   ```bash
   nvm use 22
   ```

2. **AWS CLI** configured with appropriate credentials

3. **Slack App** created with OAuth credentials (see [slack-oauth-setup.md](./slack-oauth-setup.md))

4. **Existing stacks deployed**:
   - DatabaseStack (Users table)
   - AuthStack (Cognito User Pool)
   - GmailIntegrationStack (shared KMS key)

## Deployment Steps

### 1. Build the Backend

From the project root:

```bash
npm run build:backend
```

Or from the backend directory:

```bash
cd backend
npm run build
```

### 2. Synthesize CloudFormation Template

Verify the stack synthesizes correctly:

```bash
cd backend
npm run cdk:synth SlackIntegrationStack
```

This will output the CloudFormation template. Review it for any issues.

### 3. Preview Changes

See what will be deployed:

```bash
npm run cdk:diff SlackIntegrationStack
```

This shows the infrastructure changes that will be made.

### 4. Deploy the Stack

Deploy the Slack integration stack:

```bash
npm run cdk:deploy SlackIntegrationStack
```

The deployment will:
- Create 4 Lambda functions (authorize, callback, status, disconnect)
- Create API Gateway REST API with 4 endpoints
- Configure Cognito authorizer for protected endpoints
- Set up IAM permissions for DynamoDB, KMS, and Parameter Store
- Configure rate limiting and CORS
- Output the API Gateway URL and Parameter Store paths

### 5. Configure OAuth Credentials

After deployment, add your Slack OAuth credentials to Parameter Store:

```bash
# Add Client ID
aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-id" \
  --value "YOUR_SLACK_CLIENT_ID" \
  --type "SecureString" \
  --description "Slack OAuth Client ID for Slack integration"

# Add Client Secret
aws ssm put-parameter \
  --name "/flowrecall/slack-oauth-client-secret" \
  --value "YOUR_SLACK_CLIENT_SECRET" \
  --type "SecureString" \
  --description "Slack OAuth Client Secret for Slack integration"
```

See [slack-oauth-setup.md](./slack-oauth-setup.md) for detailed instructions on obtaining these credentials.

### 6. Update Slack App Redirect URI

After deployment, the CDK outputs will include the API Gateway URL. Update your Slack app's redirect URI:

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Select your FlowRecall app
3. Navigate to **OAuth & Permissions**
4. Add the redirect URI: `https://{api-gateway-id}.execute-api.{region}.amazonaws.com/prod/api/integrations/slack/callback`
5. Save changes

### 7. Verify Deployment

Test the integration:

1. Open the FlowRecall frontend
2. Navigate to the Integrations page
3. Click "Connect" on the Slack integration card
4. Complete the OAuth flow
5. Verify the connection shows as "Connected" with your workspace name

## Stack Outputs

After deployment, the following outputs are available:

- **ApiGatewayUrl**: Base URL for the Slack integration API
- **SlackOAuthClientIdParam**: Parameter Store path for Client ID
- **SlackOAuthClientSecretParam**: Parameter Store path for Client Secret

View outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name SlackIntegrationStack \
  --query 'Stacks[0].Outputs'
```

## Stack Dependencies

The SlackIntegrationStack depends on:

1. **DatabaseStack**: Provides the Users DynamoDB table
2. **AuthStack**: Provides the Cognito User Pool for authentication
3. **GmailIntegrationStack**: Provides the shared KMS key for token encryption

Deploy in this order:
```bash
npm run cdk:deploy DatabaseStack
npm run cdk:deploy AuthStack
npm run cdk:deploy GmailIntegrationStack
npm run cdk:deploy SlackIntegrationStack
```

Or deploy all at once:
```bash
npm run cdk:deploy --all
```

## Troubleshooting

### Stack Deployment Fails

**Error**: "Resource already exists"
- Solution: Check if resources from a previous deployment exist and clean them up

**Error**: "Insufficient permissions"
- Solution: Ensure your AWS credentials have permissions to create Lambda, API Gateway, IAM roles, etc.

### OAuth Flow Fails

**Error**: "Service unavailable"
- Check that Parameter Store parameters exist with correct names
- Verify Lambda functions have SSM read permissions

**Error**: "Invalid redirect URI"
- Ensure the redirect URI in Slack app matches the deployed API Gateway URL exactly
- Check for trailing slashes or protocol mismatches

### Lambda Function Errors

View logs:
```bash
aws logs tail /aws/lambda/SlackIntegrationStack-OAuthInitiationHandler --follow
aws logs tail /aws/lambda/SlackIntegrationStack-OAuthCallbackHandler --follow
aws logs tail /aws/lambda/SlackIntegrationStack-StatusHandler --follow
aws logs tail /aws/lambda/SlackIntegrationStack-DisconnectHandler --follow
```

## Updating the Stack

To update the stack after making changes:

1. Build the backend: `npm run build:backend`
2. Preview changes: `npm run cdk:diff SlackIntegrationStack`
3. Deploy updates: `npm run cdk:deploy SlackIntegrationStack`

## Rollback

If deployment fails or you need to rollback:

```bash
# Rollback to previous version
aws cloudformation cancel-update-stack --stack-name SlackIntegrationStack

# Or destroy the stack completely
npm run cdk:destroy SlackIntegrationStack
```

Note: Destroying the stack will delete all Lambda functions and API Gateway resources, but will not delete Parameter Store parameters or DynamoDB data.

## Cost Considerations

The Slack integration uses the following AWS services:

- **Lambda**: Pay per invocation (free tier: 1M requests/month)
- **API Gateway**: Pay per request (free tier: 1M requests/month)
- **DynamoDB**: On-demand pricing (free tier: 25 GB storage)
- **KMS**: Shared key with Gmail integration ($1/month + $0.03 per 10k requests)
- **Parameter Store**: Free for standard parameters
- **CloudWatch Logs**: Pay per GB ingested (free tier: 5 GB/month)

Expected monthly cost for moderate usage: $1-5

## Security Notes

- All OAuth tokens are encrypted at rest using KMS
- Parameter Store parameters use SecureString type with encryption
- Lambda functions have least-privilege IAM permissions
- API Gateway endpoints use Cognito authentication (except callback)
- Rate limiting prevents abuse (10 req/s per user)
- CORS is configured for specific origins only

## Next Steps

After successful deployment:

1. Test the OAuth flow end-to-end
2. Monitor CloudWatch logs for errors
3. Set up CloudWatch alarms for Lambda errors
4. Configure backup and disaster recovery
5. Document any environment-specific configuration

# Bedrock Model Access Setup Guide

This guide walks you through configuring Amazon Bedrock model access for the FlowRecall Bedrock Message Analysis feature.

## Overview

Amazon Bedrock requires explicit model access approval before you can invoke foundation models. This is a one-time setup per AWS account and region.

## Prerequisites

- AWS account with appropriate permissions
- Access to AWS Console
- IAM permissions to request Bedrock model access

## Step-by-Step Setup

### 1. Navigate to Bedrock Model Access

1. Log in to the [AWS Console](https://console.aws.amazon.com/)
2. Navigate to **Amazon Bedrock** service
3. In the left sidebar, click **Model access**
4. Select your target region (e.g., `us-east-1`, `us-west-2`)

### 2. Request Model Access

1. Click **Manage model access** or **Request model access**
2. Find **Anthropic** in the model providers list
3. Check the box for **Claude 3 Haiku**
   - Model ID: `anthropic.claude-3-haiku-20240307-v1:0`
4. Review and accept the End User License Agreement (EULA)
5. Click **Request model access** or **Save changes**

### 3. Wait for Approval

- Most models are approved **immediately**
- Some models may require manual approval (1-2 business days)
- You'll receive an email notification when approved
- Check the **Model access** page for status updates

### 4. Verify Model Access

Once approved, verify access:

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query "modelSummaries[?modelId=='anthropic.claude-3-haiku-20240307-v1:0']"
```

Expected output:
```json
[
  {
    "modelId": "anthropic.claude-3-haiku-20240307-v1:0",
    "modelName": "Claude 3 Haiku",
    "providerName": "Anthropic",
    "inputModalities": ["TEXT"],
    "outputModalities": ["TEXT"],
    "responseStreamingSupported": true
  }
]
```

## Supported Models

The Bedrock Message Analysis feature supports the following models:

### Recommended: Claude 3 Haiku (Default)

- **Model ID**: `anthropic.claude-3-haiku-20240307-v1:0`
- **Provider**: Anthropic
- **Best for**: Cost-effective, fast analysis
- **Pricing**: ~$0.25 per 1M input tokens, ~$1.25 per 1M output tokens
- **Speed**: Fastest in Claude 3 family
- **Quality**: Good for structured extraction tasks

### Alternative: Claude 3 Sonnet

- **Model ID**: `anthropic.claude-3-sonnet-20240229-v1:0`
- **Provider**: Anthropic
- **Best for**: Higher quality analysis
- **Pricing**: ~$3 per 1M input tokens, ~$15 per 1M output tokens
- **Speed**: Moderate
- **Quality**: Better reasoning and nuance

### Alternative: Amazon Titan Text Express

- **Model ID**: `amazon.titan-text-express-v1`
- **Provider**: Amazon
- **Best for**: AWS-native option
- **Pricing**: ~$0.20 per 1M input tokens, ~$0.60 per 1M output tokens
- **Speed**: Fast
- **Quality**: Good for basic extraction

## Model Selection Trade-offs

| Factor | Claude 3 Haiku | Claude 3 Sonnet | Titan Text Express |
|--------|----------------|-----------------|-------------------|
| Cost | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| Speed | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Quality | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| JSON Output | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

## Configuring Model ID in CDK

The model ID is configured in the CDK stack via environment variables:

```typescript
// In backend/lib/backend-stack.ts or analysis-stack.ts
const messageAnalyzer = new lambda.Function(this, 'MessageAnalyzer', {
  // ... other config
  environment: {
    MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0', // Change here
    // ... other env vars
  },
});
```

To switch models:
1. Update the `MODEL_ID` environment variable in the CDK stack
2. Ensure you have access to the new model in Bedrock
3. Redeploy: `npm run deploy:analysis`

## Region Availability

Bedrock model availability varies by region. Check the [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) for current availability.

**Recommended regions for Claude 3 Haiku**:
- `us-east-1` (N. Virginia)
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- `ap-southeast-1` (Singapore)

## IAM Permissions

The Lambda execution role requires these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    }
  ]
}
```

These permissions are automatically configured by the CDK stack.

## Cost Management

### Monitoring Usage

1. **CloudWatch Metrics**: Monitor `BedrockInvocationCount` metric
2. **Cost Explorer**: Filter by Bedrock service
3. **Billing Alerts**: Set up alerts for unexpected usage

### Token Limits

The feature is configured with token limits to control costs:

- **Max input tokens**: 100,000 per invocation
- **Max output tokens**: 4,096 per invocation
- **Timeout**: 5 minutes per Lambda invocation

### Estimated Costs

For a typical analysis of 100 messages (~50,000 input tokens):

- **Claude 3 Haiku**: ~$0.01 per analysis
- **Claude 3 Sonnet**: ~$0.15 per analysis
- **Titan Text Express**: ~$0.01 per analysis

## Troubleshooting

### Error: "Access denied to model"

**Cause**: Model access not approved or IAM permissions missing

**Solution**:
1. Verify model access in AWS Console → Bedrock → Model access
2. Check Lambda execution role has `bedrock:InvokeModel` permission
3. Ensure you're in the correct region

### Error: "Model not found"

**Cause**: Model ID is incorrect or not available in region

**Solution**:
1. Verify model ID matches exactly (case-sensitive)
2. Check model availability in your region
3. List available models: `aws bedrock list-foundation-models`

### Error: "Rate limit exceeded"

**Cause**: Too many concurrent Bedrock invocations

**Solution**:
1. Implement exponential backoff (future enhancement)
2. Request quota increase in AWS Service Quotas
3. Reduce concurrent Lambda invocations

## Testing Model Access

Test Bedrock access with a simple invocation:

```bash
aws bedrock-runtime invoke-model \
  --region us-east-1 \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}' \
  --cli-binary-format raw-in-base64-out \
  output.json

cat output.json
```

Expected output:
```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! How can I help you today?"}],
  "model": "claude-3-haiku-20240307",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 12}
}
```

## Additional Resources

- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Anthropic Claude Documentation](https://docs.anthropic.com/claude/docs)
- [Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Bedrock Model Access Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)

## Support

For issues with Bedrock model access:
1. Check AWS Service Health Dashboard
2. Contact AWS Support
3. Review CloudWatch Logs for detailed error messages

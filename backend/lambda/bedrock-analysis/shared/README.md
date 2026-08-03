# Bedrock Client

Reusable abstraction for Amazon Bedrock API interactions used by Message_Analyzer and Timeline_Generator Lambda functions.

## Features

- **IAM Authentication**: Automatically uses Lambda execution role credentials
- **Multiple Model Support**: Works with Claude and Titan model families
- **Comprehensive Error Handling**: Classifies errors into AUTH, RATE_LIMIT, TIMEOUT, INVALID_RESPONSE, and SYSTEM types
- **JSON Response Parsing**: Automatically parses and validates JSON responses
- **Structured Logging**: Logs all invocations with request/response metadata

## Usage

```typescript
import { BedrockClient, BedrockResponse } from './shared';

// Initialize the client
const client = new BedrockClient({
  modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  region: 'us-east-1',
  maxTokens: 4096,
  temperature: 0.7,
});

// Or use environment variables
const client = new BedrockClient({
  modelId: process.env.MODEL_ID!, // Falls back to Claude 3 Haiku
});

// Invoke the model
interface MyResponse {
  decisions: Array<{ text: string; context: string }>;
  tasks: Array<{ text: string; priority: string }>;
}

const response: BedrockResponse<MyResponse> = await client.invoke({
  prompt: 'Analyze these messages...',
  systemPrompt: 'You are an AI assistant that extracts insights.',
});

// Handle the response
if (response.success) {
  console.log('Analysis complete:', response.data);
} else {
  console.error('Analysis failed:', response.error);
  
  // Handle specific error types
  switch (response.error?.type) {
    case 'AUTH':
      // Authentication/authorization failure
      break;
    case 'RATE_LIMIT':
      // Rate limit exceeded - retry with backoff
      break;
    case 'TIMEOUT':
      // Request timed out
      break;
    case 'INVALID_RESPONSE':
      // Response was not valid JSON
      break;
    case 'SYSTEM':
      // Network or other system error
      break;
  }
}
```

## Configuration

### Environment Variables

- `MODEL_ID`: Bedrock model ID (default: `anthropic.claude-3-haiku-20240307-v1:0`)
- `AWS_REGION`: AWS region for Bedrock API (default: `us-east-1`)

### Supported Models

**Claude Models** (Anthropic):
- `anthropic.claude-3-haiku-20240307-v1:0` (recommended for cost/speed)
- `anthropic.claude-3-sonnet-20240229-v1:0`
- `anthropic.claude-v2`

**Titan Models** (Amazon):
- `amazon.titan-text-express-v1`
- `amazon.titan-text-lite-v1`

## Error Types

| Type | Description | Recommended Action |
|------|-------------|-------------------|
| `AUTH` | Authentication or authorization failed | Check IAM permissions |
| `RATE_LIMIT` | API rate limit exceeded | Retry with exponential backoff |
| `TIMEOUT` | Request timed out | Reduce prompt size or increase timeout |
| `INVALID_RESPONSE` | Response was not valid JSON | Check prompt engineering |
| `SYSTEM` | Network or unexpected error | Retry or escalate |

## IAM Permissions Required

The Lambda execution role must have these permissions:

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

## Logging

The client logs structured JSON for CloudWatch Logs Insights:

- **Initialization**: Model ID, region, configuration
- **Invocation Start**: Model ID, prompt length, timestamp
- **Invocation Complete**: Model ID, duration, success status
- **Invocation Failed**: Model ID, duration, error details
- **Response Parsed**: Model ID, response length

Example CloudWatch Logs Insights query:

```
fields @timestamp, modelId, duration, success, error
| filter @message like /Bedrock invocation/
| sort @timestamp desc
| limit 100
```

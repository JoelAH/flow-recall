# IAM Permissions and Security Guide

This guide documents the IAM permissions, security configurations, and best practices for the Bedrock Message Analysis feature.

## Overview

The Bedrock Message Analysis feature requires specific IAM permissions for Lambda functions to access AWS services including Bedrock, DynamoDB, and CloudWatch. This document outlines the required permissions and security configurations following AWS best practices.

## Lambda Execution Role Permissions

### Required IAM Permissions

The Lambda execution role requires the following permissions:

#### 1. Bedrock Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockModelInvocation",
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

**Purpose**: Allows Lambda functions to invoke Bedrock foundation models for message analysis.

**Least-Privilege Considerations**:
- Scoped to foundation models only (not custom models)
- Does not include model management permissions
- Read-only access to models (invoke only)

#### 2. DynamoDB Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBReadMessages",
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/flow-recall-messages",
        "arn:aws:dynamodb:*:*:table/flow-recall-messages/index/*"
      ]
    },
    {
      "Sid": "DynamoDBWriteAnalysis",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/bedrock-analysis"
    }
  ]
}
```

**Purpose**: 
- Read access to Messages table for retrieving messages
- Write access to Analysis table for storing results

**Least-Privilege Considerations**:
- Separate read and write permissions
- No delete permissions
- No scan operations (expensive and unnecessary)
- Scoped to specific tables only

#### 3. CloudWatch Logs Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogsAccess",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/bedrock-analysis-*"
    }
  ]
}
```

**Purpose**: Allows Lambda functions to write logs to CloudWatch Logs.

**Least-Privilege Considerations**:
- Scoped to specific log group prefix
- No read or delete permissions
- Standard Lambda logging permissions

#### 4. CloudWatch Metrics Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchMetricsAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "FlowRecall/BedrockAnalysis"
        }
      }
    }
  ]
}
```

**Purpose**: Allows Lambda functions to emit custom CloudWatch metrics.

**Least-Privilege Considerations**:
- Scoped to specific namespace
- Write-only access
- No read or delete permissions

## CDK IAM Configuration

The CDK stack automatically configures these permissions:

```typescript
// In backend/lib/analysis-stack.ts or backend-stack.ts

import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Create execution role
const executionRole = new iam.Role(this, 'BedrockAnalysisExecutionRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  description: 'Execution role for Bedrock Message Analysis Lambda functions',
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
  ],
});

// Add Bedrock permissions
executionRole.addToPolicy(new iam.PolicyStatement({
  sid: 'BedrockModelInvocation',
  effect: iam.Effect.ALLOW,
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
  ],
  resources: ['arn:aws:bedrock:*::foundation-model/*'],
}));

// Add DynamoDB read permissions
messagesTable.grantReadData(executionRole);

// Add DynamoDB write permissions
analysisTable.grantWriteData(executionRole);

// Add CloudWatch metrics permissions
executionRole.addToPolicy(new iam.PolicyStatement({
  sid: 'CloudWatchMetricsAccess',
  effect: iam.Effect.ALLOW,
  actions: ['cloudwatch:PutMetricData'],
  resources: ['*'],
  conditions: {
    StringEquals: {
      'cloudwatch:namespace': 'FlowRecall/BedrockAnalysis',
    },
  },
}));
```

## DynamoDB Encryption Settings

### Analysis Table Encryption

The Analysis table uses AWS-managed encryption at rest:

```typescript
new dynamodb.Table(this, 'AnalysisTable', {
  tableName: 'bedrock-analysis',
  partitionKey: {
    name: 'analysisId',
    type: dynamodb.AttributeType.STRING,
  },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  encryption: dynamodb.TableEncryption.AWS_MANAGED, // AWS-managed KMS key
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

**Encryption Details**:
- **Type**: AWS-managed KMS encryption
- **Key**: AWS-owned key (no additional cost)
- **Scope**: Encrypts all data at rest
- **Performance**: No impact on read/write performance

### Upgrading to Customer-Managed Keys (Optional)

For enhanced security and audit requirements, you can use customer-managed KMS keys:

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';

// Create KMS key
const encryptionKey = new kms.Key(this, 'AnalysisTableKey', {
  description: 'KMS key for Analysis table encryption',
  enableKeyRotation: true,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// Use customer-managed key
new dynamodb.Table(this, 'AnalysisTable', {
  // ... other config
  encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: encryptionKey,
});
```

**Benefits**:
- Full control over key rotation
- CloudTrail audit logs for key usage
- Cross-account access control

**Trade-offs**:
- Additional cost (~$1/month per key)
- Requires KMS permissions in IAM role
- More complex key management

## CloudWatch Logs Retention Policies

### Log Group Configuration

CloudWatch Logs retention is configured in the CDK stack:

```typescript
import * as logs from 'aws-cdk-lib/aws-logs';

const messageAnalyzer = new lambda.Function(this, 'MessageAnalyzer', {
  // ... other config
  logRetention: logs.RetentionDays.ONE_MONTH, // 30 days
});

const timelineGenerator = new lambda.Function(this, 'TimelineGenerator', {
  // ... other config
  logRetention: logs.RetentionDays.ONE_MONTH, // 30 days
});
```

### Retention Policy Options

| Retention Period | Use Case | Cost Impact |
|------------------|----------|-------------|
| 1 day | Development/testing | Minimal |
| 7 days | Short-term debugging | Low |
| 30 days | **Recommended for production** | Moderate |
| 90 days | Compliance requirements | Higher |
| 1 year | Long-term audit | Highest |
| Never expire | Regulatory requirements | Very high |

**Recommendation**: Use 30 days for production to balance cost and debugging needs.

### Log Encryption

CloudWatch Logs are encrypted at rest by default using AWS-managed keys. For enhanced security:

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';

const logEncryptionKey = new kms.Key(this, 'LogEncryptionKey', {
  description: 'KMS key for CloudWatch Logs encryption',
  enableKeyRotation: true,
});

const logGroup = new logs.LogGroup(this, 'AnalysisLogGroup', {
  logGroupName: '/aws/lambda/bedrock-analysis-message-analyzer',
  retention: logs.RetentionDays.ONE_MONTH,
  encryptionKey: logEncryptionKey,
});
```

## Security Best Practices

### 1. Least-Privilege Principle

**Implementation**:
- Grant only the minimum permissions required
- Separate read and write permissions
- Scope permissions to specific resources
- Use conditions to restrict access

**Example**:
```typescript
// ❌ BAD: Overly permissive
executionRole.addToPolicy(new iam.PolicyStatement({
  actions: ['dynamodb:*'],
  resources: ['*'],
}));

// ✅ GOOD: Least-privilege
executionRole.addToPolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query', 'dynamodb:GetItem'],
  resources: [messagesTable.tableArn, `${messagesTable.tableArn}/index/*`],
}));
```

### 2. Resource-Based Policies

Use resource-based policies where possible:

```typescript
// Grant specific permissions using CDK helpers
messagesTable.grantReadData(executionRole);
analysisTable.grantWriteData(executionRole);
```

**Benefits**:
- Automatically scoped to specific resources
- Easier to audit and maintain
- Follows AWS best practices

### 3. Encryption at Rest

**Requirements**:
- All DynamoDB tables must use encryption at rest
- CloudWatch Logs should use encryption for sensitive data
- Consider customer-managed keys for compliance requirements

### 4. Encryption in Transit

**Implementation**:
- All AWS SDK calls use HTTPS by default
- Bedrock API calls are encrypted in transit
- DynamoDB connections use TLS 1.2+

### 5. IAM Role Separation

**Recommendation**: Use separate IAM roles for different Lambda functions if they have different permission requirements.

```typescript
// Separate roles for different functions
const analyzerRole = new iam.Role(this, 'MessageAnalyzerRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});

const generatorRole = new iam.Role(this, 'TimelineGeneratorRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});
```

**Current Implementation**: Both functions use the same role since they have identical permission requirements.

### 6. Audit and Monitoring

**CloudTrail Integration**:
- Enable CloudTrail for IAM API calls
- Monitor for unauthorized access attempts
- Set up alerts for suspicious activity

**CloudWatch Alarms**:
```typescript
new cloudwatch.Alarm(this, 'UnauthorizedAccessAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Lambda',
    metricName: 'Errors',
    dimensionsMap: {
      FunctionName: messageAnalyzer.functionName,
    },
  }),
  threshold: 5,
  evaluationPeriods: 1,
  alarmDescription: 'Alert on Lambda authorization errors',
});
```

### 7. Secrets Management

**For future enhancements** (API keys, credentials):

```typescript
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

const apiSecret = new secretsmanager.Secret(this, 'BedrockApiSecret', {
  description: 'API credentials for Bedrock integration',
});

// Grant read access
apiSecret.grantRead(executionRole);
```

**Best Practices**:
- Never hardcode credentials
- Use AWS Secrets Manager or Parameter Store
- Rotate secrets regularly
- Audit secret access

## Compliance Considerations

### GDPR Compliance

- **Data Encryption**: All data encrypted at rest and in transit
- **Data Retention**: Configure appropriate log retention periods
- **Data Deletion**: Use `removalPolicy: cdk.RemovalPolicy.DESTROY` for non-production

### HIPAA Compliance

- **Customer-Managed Keys**: Required for HIPAA workloads
- **Audit Logging**: Enable CloudTrail for all API calls
- **Access Controls**: Implement strict IAM policies

### SOC 2 Compliance

- **Least-Privilege Access**: Documented and enforced
- **Encryption**: At rest and in transit
- **Monitoring**: CloudWatch metrics and alarms

## Troubleshooting IAM Issues

### Error: "Access Denied" when invoking Bedrock

**Cause**: Missing `bedrock:InvokeModel` permission

**Solution**:
1. Verify IAM role has Bedrock permissions
2. Check resource ARN matches foundation model pattern
3. Ensure region supports Bedrock

```bash
# Check IAM role policies
aws iam get-role-policy --role-name <role-name> --policy-name <policy-name>

# Test Bedrock access
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"test"}]}' \
  --cli-binary-format raw-in-base64-out \
  output.json
```

### Error: "Access Denied" when reading DynamoDB

**Cause**: Missing DynamoDB read permissions

**Solution**:
1. Verify IAM role has `dynamodb:Query` permission
2. Check table ARN and index ARN are correct
3. Ensure table exists in the region

```bash
# Check table permissions
aws dynamodb describe-table --table-name flow-recall-messages

# Test query access
aws dynamodb query \
  --table-name flow-recall-messages \
  --key-condition-expression "jobId = :jobId" \
  --expression-attribute-values '{":jobId":{"S":"test-job-id"}}'
```

### Error: "Unable to write to CloudWatch Logs"

**Cause**: Missing CloudWatch Logs permissions

**Solution**:
1. Verify IAM role has `logs:CreateLogStream` and `logs:PutLogEvents`
2. Check log group exists or role can create it
3. Ensure log group name matches Lambda function name pattern

## Security Checklist

Before deploying to production:

- [ ] IAM roles follow least-privilege principle
- [ ] DynamoDB tables use encryption at rest
- [ ] CloudWatch Logs retention configured appropriately
- [ ] CloudTrail enabled for audit logging
- [ ] CloudWatch alarms configured for security events
- [ ] No hardcoded credentials in code
- [ ] Resource-based policies used where possible
- [ ] Separate IAM roles for different permission requirements (if needed)
- [ ] KMS keys configured for sensitive data (if required)
- [ ] Regular security reviews scheduled

## Additional Resources

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [DynamoDB Encryption at Rest](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html)
- [CloudWatch Logs Encryption](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html)
- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)
- [Bedrock Security](https://docs.aws.amazon.com/bedrock/latest/userguide/security.html)


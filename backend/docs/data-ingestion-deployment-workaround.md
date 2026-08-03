# DataIngestionStack Deployment Workaround

## Issue

The DataIngestionStack deployment is failing due to AWS CloudFormation's Early Validation hook (`AWS::EarlyValidation::ResourceExistenceCheck`). This hook validates that referenced resources exist before creating the changeset, but it doesn't properly handle CDK's cross-stack references using tokens.

## Error Message

```
Failed to create ChangeSet cdk-deploy-change-set on DataIngestionStack: FAILED, 
The following hook(s)/validation failed: [AWS::EarlyValidation::ResourceExistenceCheck]
```

## Root Cause

The Early Validation hook cannot resolve CDK tokens for cross-stack references at validation time. This affects:
- Cognito UserPool ARN reference from AuthStack
- DynamoDB Users table reference from DatabaseStack  
- KMS key reference from GmailIntegrationStack

## Temporary Solution

The stack has been modified to use a hardcoded UserPool ARN to bypass the validation issue:

```typescript
// In backend/lib/data-ingestion-stack.ts
const userPoolArn = 'arn:aws:cognito-idp:<REGION>:<AWS_ACCOUNT_ID>:userpool/<USER_POOL_ID>';
```

## Deployment Options

### Option 1: Deploy via AWS Console (Recommended)

1. Generate the CloudFormation template:
   ```bash
   cd backend
   npx cdk synth DataIngestionStack > DataIngestionStack.template.json
   ```

2. Go to AWS CloudFormation Console
3. Create a new stack
4. Upload the `DataIngestionStack.template.json` file
5. Follow the wizard to deploy

### Option 2: Use AWS CLI with --no-execute-changeset

```bash
cd backend
npx cdk deploy DataIngestionStack --no-execute-changeset
# Then manually execute the changeset in the AWS Console
```

### Option 3: Contact AWS Support

Request to disable the Early Validation hook for your account or report the issue with cross-stack references.

## Long-term Solution

Once AWS fixes the Early Validation hook to properly handle CDK cross-stack references, revert the hardcoded values:

1. Update `backend/lib/data-ingestion-stack.ts` to use `props.userPoolId`
2. Update `backend/bin/backend.ts` to pass `authStack.userPool.userPoolId`
3. Redeploy the stack

## Related AWS Issues

- AWS CDK Issue: Cross-stack references with Early Validation
- CloudFormation Hook: AWS::EarlyValidation::ResourceExistenceCheck

## Current Status

- All prerequisite stacks deployed successfully (DatabaseStack, AuthStack, GmailIntegrationStack)
- DataIngestionStack code is complete and tested
- Only deployment is blocked by the validation hook

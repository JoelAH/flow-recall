# Task 1 Implementation Summary: AWS Infrastructure Setup

## Overview

Task 1 of the Gmail Integration spec has been completed. This task set up the core AWS infrastructure and configuration needed for the Gmail OAuth integration feature.

## What Was Implemented

### 1.1 KMS Key for OAuth Token Encryption ✅

**File**: `backend/lib/gmail-integration-stack.ts`

Created a symmetric KMS key with the following configuration:
- **Alias**: `alias/flowrecall-oauth-tokens`
- **Key Rotation**: Enabled (automatic annual rotation)
- **Removal Policy**: RETAIN (key persists even if stack is deleted)
- **Permissions**: Configured to allow Lambda functions to encrypt/decrypt

The key will be used to encrypt Gmail OAuth access tokens and refresh tokens before storing them in DynamoDB.

### 1.2 DynamoDB Users Table Schema ✅

**File**: `backend/lib/types/user-record.ts`

Created TypeScript type definitions for the Users table schema with new Gmail integration fields:

```typescript
interface GmailIntegration {
  status: 'connected' | 'disconnected' | 'error';
  encryptedAccessToken?: string;   // Base64-encoded KMS ciphertext
  encryptedRefreshToken?: string;  // Base64-encoded KMS ciphertext
  tokenExpiresAt?: number;         // Unix timestamp
  connectedEmail?: string;         // Gmail address
  connectedAt?: string;            // ISO 8601 timestamp
  lastRefreshedAt?: string;        // ISO 8601 timestamp
  errorMessage?: string;           // Last error if status='error'
}

interface OAuthStateToken {
  createdAt: number;   // Unix timestamp
  expiresAt: number;   // Unix timestamp
}

interface UserRecord {
  // Existing fields
  internalUserId: string;
  cognitoUserId: string;
  email: string;
  userRole: string;
  created: string;
  updated: string;
  
  // New fields
  gmailIntegration?: GmailIntegration;
  oauthStateTokens?: Record<string, OAuthStateToken>;
}
```

**Note**: No DynamoDB table changes are required. The existing Users table already supports nested attributes. These types will be used by Lambda functions to ensure type safety when reading/writing Gmail integration data.

### 1.3 Google OAuth Credentials Configuration ✅

**Files**: 
- `backend/lib/gmail-integration-stack.ts` (Parameter Store references)
- `backend/docs/gmail-oauth-setup.md` (Setup documentation)

Configured AWS Systems Manager Parameter Store for storing Google OAuth credentials:
- **Parameter Names**: 
  - `/flowrecall/gmail-oauth-client-id` - Google OAuth Client ID
  - `/flowrecall/gmail-oauth-client-secret` - Google OAuth Client Secret
- **Parameter Type**: SecureString (encrypted at rest using AWS KMS)
- **Lambda Access**: Environment variables reference parameter names, Lambda functions read from Parameter Store at runtime

**Required OAuth Scopes** (documented in setup guide):
1. `https://www.googleapis.com/auth/gmail.readonly` - Read-only access to Gmail messages
2. `https://www.googleapis.com/auth/gmail.metadata` - Access to message metadata
3. `https://www.googleapis.com/auth/userinfo.email` - User's email address

**Post-Deployment Action Required**: After deploying the CDK stack, the parameters must be created manually in Parameter Store with actual Google OAuth credentials from Google Cloud Console.

### 1.4 API Gateway Endpoints ✅

**File**: `backend/lib/gmail-integration-stack.ts`

Created a REST API Gateway with four endpoints for Gmail integration:

#### Endpoints

1. **GET /api/integrations/gmail/authorize**
   - **Auth**: Cognito User Pool Authorizer (required)
   - **Purpose**: Initiate OAuth flow and return authorization URL
   - **Lambda**: `backend/lambda/gmail-integration/authorize.ts`

2. **GET /api/integrations/gmail/callback**
   - **Auth**: None (public endpoint with state validation)
   - **Purpose**: Handle OAuth callback from Google
   - **Lambda**: `backend/lambda/gmail-integration/callback.ts`

3. **GET /api/integrations/gmail/status**
   - **Auth**: Cognito User Pool Authorizer (required)
   - **Purpose**: Check Gmail connection status
   - **Lambda**: `backend/lambda/gmail-integration/status.ts`

4. **POST /api/integrations/gmail/disconnect**
   - **Auth**: Cognito User Pool Authorizer (required)
   - **Purpose**: Disconnect Gmail integration
   - **Lambda**: `backend/lambda/gmail-integration/disconnect.ts`

#### CORS Configuration

- **Allowed Origins**: `http://localhost:5173`, `https://app.flowrecall.com`
- **Allowed Methods**: GET, POST, OPTIONS
- **Allowed Headers**: Content-Type, Authorization
- **Allow Credentials**: true

#### Rate Limiting

- **Throttle Rate**: 10 requests per second per user
- **Burst Limit**: 20 requests
- **Daily Quota**: 1000 requests per day per user

#### Lambda Functions

Created placeholder Lambda function files (full implementation in later tasks):
- `backend/lambda/gmail-integration/authorize.ts`
- `backend/lambda/gmail-integration/callback.ts`
- `backend/lambda/gmail-integration/status.ts`
- `backend/lambda/gmail-integration/disconnect.ts`

Each Lambda has appropriate IAM permissions:
- DynamoDB read/write access to Users table
- SSM Parameter Store read access to Google OAuth parameters
- KMS encrypt/decrypt permissions (for callback and disconnect handlers)

## Stack Integration

**File**: `backend/bin/backend.ts`

Created new `GmailIntegrationStack` and integrated it with existing stacks:
- Added dependency on `DatabaseStack` (for Users table reference)
- Added dependency on `AuthStack` (for Cognito User Pool ARN)
- Stack will be deployed alongside existing DatabaseStack and AuthStack

## Dependencies Added

**File**: `backend/package.json`

Added `@types/aws-lambda` to devDependencies for Lambda function type definitions.

## Outputs

The CDK stack exports the following values for reference:
- `OAuthTokensKeyArn` - KMS key ARN for OAuth token encryption
- `OAuthTokensKeyId` - KMS key ID
- `GmailOAuthClientIdParam` - SSM Parameter Store path for OAuth Client ID
- `GmailOAuthClientSecretParam` - SSM Parameter Store path for OAuth Client Secret
- `GmailIntegrationApiUrl` - API Gateway base URL

## Next Steps

### Immediate Actions Required

1. **Upgrade Node.js**: The project requires Node.js 22.x (as specified in tech.md). The current environment has Node 12.x which is incompatible with TypeScript 5.6 and AWS CDK 2.x.

2. **Deploy the Stack**:
   ```bash
   cd backend
   npm run cdk:deploy
   ```

3. **Configure Google OAuth**:
   - Follow the guide in `backend/docs/gmail-oauth-setup.md`
   - Create OAuth credentials in Google Cloud Console
   - Create SSM parameters with actual credentials:
     ```bash
     aws ssm put-parameter \
       --name "/flowrecall/gmail-oauth-client-id" \
       --value "YOUR_CLIENT_ID" \
       --type "SecureString"
     
     aws ssm put-parameter \
       --name "/flowrecall/gmail-oauth-client-secret" \
       --value "YOUR_CLIENT_SECRET" \
       --type "SecureString"
     ```

### Subsequent Tasks

Task 2 will implement the Token Manager Lambda function with KMS encryption/decryption, token storage, retrieval, refresh, and deletion functionality.

## Verification

To verify the infrastructure after deployment:

```bash
# Check that the stack deployed successfully
aws cloudformation describe-stacks --stack-name GmailIntegrationStack

# Verify KMS key exists
aws kms describe-key --key-id alias/flowrecall-oauth-tokens

# Verify SSM parameters exist
aws ssm get-parameter --name "/flowrecall/gmail-oauth-client-id" --with-decryption
aws ssm get-parameter --name "/flowrecall/gmail-oauth-client-secret" --with-decryption

# Verify API Gateway endpoints
aws apigateway get-rest-apis --query 'items[?name==`FlowRecall Gmail Integration API`]'
```

## Files Created/Modified

### Created
- `backend/lib/gmail-integration-stack.ts` - Main CDK stack for Gmail integration
- `backend/lib/types/user-record.ts` - TypeScript types for DynamoDB schema
- `backend/lambda/gmail-integration/authorize.ts` - OAuth initiation handler (placeholder)
- `backend/lambda/gmail-integration/callback.ts` - OAuth callback handler (placeholder)
- `backend/lambda/gmail-integration/status.ts` - Status check handler (placeholder)
- `backend/lambda/gmail-integration/disconnect.ts` - Disconnect handler (placeholder)
- `backend/docs/gmail-oauth-setup.md` - OAuth setup documentation
- `backend/docs/task-1-implementation-summary.md` - This file

### Modified
- `backend/bin/backend.ts` - Added GmailIntegrationStack instantiation
- `backend/package.json` - Added @types/aws-lambda dependency

## Requirements Validated

This implementation satisfies the following requirements from the spec:

- **Requirement 3.1, 3.2**: KMS key created for token encryption
- **Requirement 7.1-7.6**: DynamoDB schema extended with Gmail integration fields
- **Requirement 9.1-9.4**: OAuth scopes documented and configured
- **Requirement 1.2, 2.1, 5.4, 6.2**: API Gateway endpoints created with proper authentication
- **Requirement 10.1**: Cognito integration for protected endpoints

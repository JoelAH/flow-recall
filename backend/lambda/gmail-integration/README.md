# Gmail Integration Lambda Functions

This directory contains the Lambda functions for Gmail OAuth 2.0 integration.

## Files

### token-manager.ts
Handles OAuth token encryption, storage, retrieval, refresh, and deletion using AWS KMS and DynamoDB.

**Key Features:**
- KMS encryption/decryption for tokens at rest
- Automatic token refresh before expiration
- Retry logic with exponential backoff
- Graceful error handling and token revocation

### oauth-initiation-handler.ts
Handles the `/authorize` endpoint to initiate the OAuth flow.

**Flow:**
1. Validates Cognito session from authorizer context
2. Generates cryptographically secure state token (32 bytes)
3. Stores state token in DynamoDB with 5-minute TTL
4. Builds Google OAuth URL with required scopes
5. Returns authorization URL to frontend

**Environment Variables:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `OAUTH_REDIRECT_URI` - OAuth callback URL
- `USERS_TABLE_NAME` - DynamoDB users table name
- `STATE_TOKEN_TTL` - State token expiration in seconds (default: 300)

### oauth-callback-handler.ts
Handles the `/callback` endpoint to process Google's OAuth redirect.

**Flow:**
1. Extracts code, state, and error from query parameters
2. Validates state token exists in DynamoDB and not expired
3. Retrieves associated Cognito user ID from state token
4. Handles user cancellation (error=access_denied)
5. Exchanges authorization code for tokens with Google
6. Calls TokenManager to encrypt and store tokens
7. Deletes used state token from DynamoDB
8. Redirects to frontend with success or error status

**Environment Variables:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `OAUTH_REDIRECT_URI` - OAuth callback URL
- `USERS_TABLE_NAME` - DynamoDB users table name
- `FRONTEND_URL` - Frontend URL for redirects (default: http://localhost:5173)

## OAuth Scopes

The integration requests the following Google OAuth scopes:
- `https://www.googleapis.com/auth/gmail.readonly` - Read-only access to Gmail
- `https://www.googleapis.com/auth/gmail.metadata` - Access to message metadata
- `https://www.googleapis.com/auth/userinfo.email` - User's email address

## State Token Design

### Design Decision: Encoded User ID in State Token

The state token includes the user ID encoded in its format: `base64url(userId):randomToken`

**Rationale:**
- The original design stored state tokens under the user's DynamoDB record
- During callback, we need to find the user by state token
- Without a GSI or separate table, this would require a table scan
- Encoding the user ID in the state token allows efficient lookup

**Security Considerations:**
- The user ID is not sensitive information (it's a Cognito sub)
- The random portion (32 bytes) provides CSRF protection
- The full token is still validated against DynamoDB storage
- Tokens expire after 5 minutes
- Tokens are single-use (deleted after validation)

**Future Improvement:**
For production at scale, consider:
- Separate DynamoDB table for state tokens with GSI
- Or use ElastiCache/Redis for temporary state storage
- This would eliminate the need to encode user ID in token

## Error Handling

All handlers implement comprehensive error handling:

### OAuth Initiation Errors
- **401 Unauthorized**: Invalid or expired Cognito session
- **500 Service Unavailable**: DynamoDB or internal error

### OAuth Callback Errors
- **cancelled**: User cancelled OAuth flow (error=access_denied)
- **invalid_request**: Missing code or state parameters
- **invalid_state**: Invalid or expired state token
- **token_exchange_failed**: Failed to exchange code for tokens

All errors redirect to frontend with appropriate query parameters.

## Testing

See the spec's tasks.md for property-based tests and unit tests to implement:
- Property tests for OAuth flow, state validation, token exchange
- Unit tests for handler logic, error cases, and edge cases

## Security Features

1. **CSRF Protection**: State tokens prevent cross-site request forgery
2. **Token Encryption**: All tokens encrypted at rest using AWS KMS
3. **Token Expiration**: State tokens expire after 5 minutes
4. **Single-Use Tokens**: State tokens deleted after use
5. **Secure Logging**: Never logs unencrypted tokens (only last 4 chars)
6. **Automatic Refresh**: Tokens refreshed before expiration
7. **Graceful Revocation**: Tokens revoked with Google on disconnect

## Integration with CDK

These Lambda functions will be deployed via CDK stack (task 6):
- Lambda function resources
- IAM roles with KMS and DynamoDB permissions
- API Gateway integration
- Environment variable configuration
- Secrets Manager for Google client secret

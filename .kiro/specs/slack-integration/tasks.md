# Implementation Plan: Slack Integration

## Overview

This plan implements the Slack OAuth integration following the established Gmail integration pattern. The implementation uses TypeScript for all components (Lambda handlers, CDK infrastructure, React UI) and follows an event-driven serverless architecture on AWS. The system provides secure OAuth token management with KMS encryption, comprehensive error handling, and property-based testing for correctness guarantees.

## Tasks

- [x] 1. Set up infrastructure foundation
  - [x] 1.1 Create CDK stack for Slack integration
    - Create `backend/lib/slack-integration-stack.ts` with Lambda functions, API Gateway, and IAM permissions
    - Configure shared KMS key reference from Gmail integration
    - Set up Parameter Store paths for OAuth credentials
    - Configure DynamoDB table access for Users table
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9, 12.10_
  
  - [x] 1.2 Configure API Gateway endpoints
    - Define REST API with four endpoints: authorize, callback, status, disconnect
    - Configure Cognito authorizer for protected endpoints
    - Set up rate limiting (10 req/s, burst 20, quota 1000/day)
    - Configure CORS for localhost:5173 and app.flowrecall.com
    - Set timeouts (10s for authorize/status, 30s for callback/disconnect)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
  
  - [ ]* 1.3 Write infrastructure tests
    - Test CDK stack synthesizes without errors
    - Verify all endpoints are created with correct methods and auth
    - Validate rate limiting and CORS configuration
    - Check KMS key rotation and retention policies
    - _Requirements: 5.6, 5.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 2. Implement shared components
  - [x] 2.1 Create Logger utility
    - Create `backend/lambda/slack-integration/logger.ts` with structured logging methods
    - Implement specialized OAuth logging methods (logOAuthInitiation, logOAuthCallback, etc.)
    - Ensure no sensitive data logging (tokens, codes, keys)
    - Add consistent field names (requestId, userId, operation, timestamp)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10_
  
  - [ ]* 2.2 Write property test for Logger
    - **Property 18: Structured logging format**
    - **Validates: Requirements 15.9, 15.10**
    - Verify all log entries are valid JSON with consistent fields
    - Verify no sensitive data in logs (max 4 chars of credentials)
  
  - [ ]* 2.3 Write property test for logging coverage
    - **Property 19: Logging coverage**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
    - Verify each OAuth operation produces at least one log entry
  
  - [x] 2.4 Create DynamoDB Helper
    - Create `backend/lambda/slack-integration/dynamodb-helper.ts` with GSI query functions
    - Implement getUserByCognitoId using cognitoUserIdIndex GSI
    - Implement updateUserByCognitoId with automatic internalUserId lookup
    - Add retry logic with exponential backoff
    - _Requirements: 3.1, 3.2, 3.8, 6.2, 7.2, 7.6_
  
  - [ ]* 2.5 Write unit tests for DynamoDB Helper
    - Test GSI queries return correct user records
    - Test updates use correct partition key
    - Test retry logic on transient failures
    - Test error handling for missing users
  
  - [x] 2.6 Create Token Manager
    - Create `backend/lambda/slack-integration/token-manager.ts` with KMS encryption methods
    - Implement encryptToken and decryptToken using shared KMS key
    - Implement storeTokens with complete slackIntegration schema
    - Implement deleteTokens with Slack revocation and DynamoDB cleanup
    - Add retry logic for KMS and DynamoDB operations
    - _Requirements: 3.7, 3.8, 5.1, 5.2, 5.3, 5.4, 5.5, 7.3, 7.4, 7.5, 7.6_
  
  - [ ]* 2.7 Write property test for token encryption
    - **Property 7: Token encryption round-trip**
    - **Validates: Requirements 3.7, 5.1, 5.2, 7.3**
    - Generate random token strings, verify encrypt then decrypt returns original
  
  - [ ]* 2.8 Write property test for token storage
    - **Property 8: Token storage completeness**
    - **Validates: Requirements 3.8, 5.3, 5.4, 5.5**
    - Verify all required fields present after storage operation
  
  - [ ]* 2.9 Write property test for disconnect cleanup
    - **Property 13: Disconnect cleanup**
    - **Validates: Requirements 7.6, 13.10**
    - Verify slackIntegration attribute removed regardless of revocation result

- [x] 3. Checkpoint - Ensure shared components work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. Implement OAuth Initiation Handler
  - [x] 4.1 Create OAuth initiation Lambda handler
    - Create `backend/lambda/slack-integration/oauth-initiation-handler.ts`
    - Extract Cognito user ID from authorizer context
    - Fetch Slack client ID from Parameter Store with caching
    - Generate 32-byte cryptographically secure state token with encoded user ID
    - Store state token in DynamoDB with 5-minute expiration
    - Construct redirect URI from API Gateway context
    - Build Slack authorization URL with all 8 required scopes
    - Return authorization URL in response
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 14.1, 14.2, 14.3, 14.4_
  
  - [ ]* 4.2 Write property test for state token entropy
    - **Property 1: State token entropy**
    - **Validates: Requirements 1.2**
    - Generate 100 state tokens, verify each has 32+ bytes entropy
  
  - [ ]* 4.3 Write property test for state token round-trip
    - **Property 2: State token round-trip**
    - **Validates: Requirements 1.3, 3.1**
    - Generate random Cognito user IDs, verify encode then decode returns original
  
  - [ ]* 4.4 Write property test for state token expiration
    - **Property 3: State token expiration**
    - **Validates: Requirements 1.4**
    - Verify expiration is exactly 300 seconds from creation
  
  - [ ]* 4.5 Write property test for authorization URL completeness
    - **Property 4: Authorization URL completeness**
    - **Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8**
    - Parse generated URLs, verify all components present (state, client ID, redirect URI, 8 scopes)
  
  - [ ]* 4.6 Write property test for Parameter Store caching
    - **Property 5: Parameter Store caching**
    - **Validates: Requirements 2.3**
    - Verify multiple requests result in only one Parameter Store API call
  
  - [ ]* 4.7 Write property test for redirect URI format
    - **Property 16: Redirect URI format**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
    - Generate random API Gateway contexts, verify URI matches expected format
  
  - [ ]* 4.8 Write unit tests for OAuth initiation handler
    - Test successful authorization URL generation
    - Test missing Cognito user ID returns 401
    - Test missing OAuth credentials returns 500 with service_unavailable
    - Test DynamoDB failures with retry logic
    - Test state token storage with correct expiration

- [-] 5. Implement OAuth Callback Handler
  - [x] 5.1 Create OAuth callback Lambda handler
    - Create `backend/lambda/slack-integration/oauth-callback-handler.ts`
    - Extract code, state, and error from query parameters
    - Handle user cancellation (error=access_denied)
    - Parse state token to extract user ID
    - Validate state token exists and not expired
    - Fetch Slack OAuth credentials from Parameter Store
    - Exchange authorization code for tokens with Slack
    - Retrieve workspace name and user's Slack identity
    - Encrypt tokens using Token Manager
    - Store encrypted tokens with workspace info in DynamoDB
    - Delete used state token
    - Redirect to frontend with success/error status
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 14.5_
  
  - [ ]* 5.2 Write property test for state token validation
    - **Property 6: State token validation**
    - **Validates: Requirements 3.2**
    - Verify validation checks both existence and expiration
  
  - [ ]* 5.3 Write property test for state token cleanup
    - **Property 9: State token cleanup**
    - **Validates: Requirements 3.9**
    - Verify state token removed after successful OAuth flow
  
  - [ ]* 5.4 Write property test for cancellation invariant
    - **Property 10: Cancellation invariant**
    - **Validates: Requirements 4.3**
    - Verify user's slackIntegration unchanged after cancellation
  
  - [ ]* 5.5 Write property test for token expiration calculation
    - **Property 11: Token expiration calculation**
    - **Validates: Requirements 5.5**
    - Verify expiresAt equals current time plus expires_in (within 1s tolerance)
  
  - [ ]* 5.6 Write property test for redirect URI consistency
    - **Property 15: Redirect URI consistency**
    - **Validates: Requirements 14.3, 14.5**
    - Verify same URI constructed in both initiation and callback handlers
  
  - [ ]* 5.7 Write property test for schema validation
    - **Property 20: Schema validation**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8**
    - Verify slackIntegration has all required fields with correct types
  
  - [ ]* 5.8 Write unit tests for OAuth callback handler
    - Test successful token exchange and storage
    - Test user cancellation redirects with cancelled status
    - Test invalid state token redirects with invalid_state error
    - Test expired state token redirects with invalid_state error
    - Test token exchange failure redirects with token_exchange_failed error
    - Test KMS encryption failure with retry logic
    - Test DynamoDB storage failure with retry logic
    - Test state token cleanup after success

- [x] 6. Checkpoint - Ensure OAuth flow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Status Handler
  - [x] 7.1 Create status Lambda handler
    - Create `backend/lambda/slack-integration/status-handler.ts`
    - Extract Cognito user ID from authorizer context
    - Query DynamoDB for user record via GSI
    - Check for slackIntegration attribute
    - Return connected status with workspace info if present
    - Return disconnected status if no integration
    - Return error status if integration data corrupted
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 7.2 Write property test for status determination
    - **Property 12: Status determination**
    - **Validates: Requirements 6.3, 6.4**
    - Verify status is "connected" iff slackIntegration exists with valid tokens
  
  - [ ]* 7.3 Write unit tests for status handler
    - Test connected status returns workspace name and timestamp
    - Test disconnected status when no integration exists
    - Test error status when integration data corrupted
    - Test missing user record returns disconnected
    - Test unauthorized when Cognito user ID missing

- [x] 8. Implement Disconnect Handler
  - [x] 8.1 Create disconnect Lambda handler
    - Create `backend/lambda/slack-integration/disconnect-handler.ts`
    - Extract Cognito user ID from authorizer context
    - Retrieve encrypted tokens from DynamoDB
    - Decrypt access token using Token Manager
    - Revoke token with Slack API (auth.revoke)
    - Handle already-revoked tokens gracefully
    - Remove slackIntegration attribute from DynamoDB
    - Return success response
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 11.5_
  
  - [ ]* 8.2 Write unit tests for disconnect handler
    - Test successful disconnect with token revocation
    - Test disconnect proceeds when revocation fails
    - Test disconnect proceeds when token already revoked
    - Test 404 when no integration found
    - Test KMS decryption failure still removes integration
    - Test unauthorized when Cognito user ID missing

- [x] 9. Implement Frontend Integration Card
  - [x] 9.1 Create Slack Integration Card component
    - Create `frontend/src/components/SlackIntegrationCard.tsx`
    - Implement status fetching on mount
    - Implement connect button that redirects to authorization URL
    - Implement disconnect button with confirmation
    - Display workspace name and relative connection time when connected
    - Display loading spinner during connecting state
    - Display error messages with retry button
    - Process OAuth callback query parameters
    - Display toast notifications for success/error
    - _Requirements: 1.1, 1.6, 6.1, 6.6, 6.7, 6.8, 7.1, 7.8, 7.9, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  
  - [ ]* 9.2 Write property test for timestamp formatting
    - **Property 17: Timestamp formatting**
    - **Validates: Requirements 10.9**
    - Generate random timestamps, verify relative time accuracy
  
  - [ ]* 9.3 Write property test for error message mapping
    - **Property 14: Error message mapping**
    - **Validates: Requirements 11.6**
    - Verify each error code has corresponding user-friendly message
  
  - [ ]* 9.4 Write unit tests for Integration Card
    - Test renders disconnected state with Connect button
    - Test renders connecting state with spinner
    - Test renders connected state with workspace name and Disconnect button
    - Test renders error state with error message and Retry button
    - Test Connect button triggers OAuth flow
    - Test Disconnect button triggers disconnect
    - Test success callback displays success message
    - Test error callback displays error message
    - Test messages auto-dismiss after 5 seconds

- [x] 10. Wire components together and deploy
  - [x] 10.1 Integrate Slack Integration Card into integrations page
    - Add SlackIntegrationCard to integrations page alongside Gmail card
    - Ensure consistent styling with existing integrations
    - _Requirements: 10.1_
  
  - [x] 10.2 Add Slack OAuth credentials to Parameter Store
    - Document process for adding /flowrecall/slack-oauth-client-id
    - Document process for adding /flowrecall/slack-oauth-client-secret
    - _Requirements: 2.1, 2.2_
  
  - [x] 10.3 Update CDK deployment to include Slack integration stack
    - Import SlackIntegrationStack in main CDK app
    - Pass shared resources (Users table, KMS key, Cognito user pool)
    - Verify CloudFormation outputs include API Gateway URL
    - _Requirements: 12.8_
  
  - [ ]* 10.4 Write end-to-end integration tests
    - Test complete OAuth flow from initiation to callback
    - Test status check after successful connection
    - Test disconnect removes integration
    - Test error scenarios with appropriate redirects

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (20 properties total)
- Unit tests validate specific examples and edge cases
- The implementation follows the Gmail integration pattern for consistency
- All OAuth tokens are encrypted at rest with KMS
- State tokens provide CSRF protection and efficient user lookup
- Comprehensive error handling with user-friendly messages
- Structured logging throughout without exposing sensitive data

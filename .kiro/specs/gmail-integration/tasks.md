# Implementation Plan: Gmail Integration

## Overview

This plan implements Gmail OAuth 2.0 integration for FlowRecall, enabling users to securely connect their Gmail accounts. The implementation follows an incremental approach: infrastructure setup, backend OAuth handlers, token management with KMS encryption, frontend UI components, and comprehensive testing. Each task builds on previous work to ensure continuous validation.

## Tasks

- [x] 1. Set up AWS infrastructure and core configuration
  - [x] 1.1 Create KMS key for OAuth token encryption
    - Create symmetric KMS key with alias `alias/flowrecall-oauth-tokens`
    - Configure key policy to allow Lambda encrypt/decrypt operations
    - Enable automatic key rotation
    - _Requirements: 3.1, 3.2_
  
  - [x] 1.2 Update DynamoDB Users table schema
    - Add `gmailIntegration` attribute with nested fields for token storage
    - Add `oauthStateTokens` map attribute for CSRF protection
    - Update TypeScript types in shared/types (if exists) or backend
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  
  - [x] 1.3 Configure Google OAuth credentials
    - Store Google Client ID and Client Secret in AWS Secrets Manager
    - Configure OAuth redirect URI in Google Cloud Console
    - Document required OAuth scopes in configuration
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [x] 1.4 Create API Gateway endpoints for Gmail integration
    - Add `/api/integrations/gmail/authorize` (GET, Cognito authorized)
    - Add `/api/integrations/gmail/callback` (GET, public with state validation)
    - Add `/api/integrations/gmail/status` (GET, Cognito authorized)
    - Add `/api/integrations/gmail/disconnect` (POST, Cognito authorized)
    - Configure CORS for frontend origin
    - Configure rate limiting (10 req/sec, 1000/day per user)
    - _Requirements: 1.2, 2.1, 5.4, 6.2_

- [x] 2. Implement Token Manager Lambda function
  - [x] 2.1 Create TokenManager class with KMS encryption/decryption
    - Implement `encryptToken(token: string): Promise<string>` using KMS
    - Implement `decryptToken(encryptedToken: string): Promise<string>` using KMS
    - Add retry logic with exponential backoff for KMS operations
    - _Requirements: 3.1, 3.2, 3.5_
  
  - [ ]* 2.2 Write property test for Token Manager
    - **Property 5: Token encryption round trip**
    - **Validates: Requirements 3.1, 3.2, 3.5**
  
  - [x] 2.3 Implement token storage methods
    - Implement `storeTokens(userId, accessToken, refreshToken, expiresIn, email)`
    - Encrypt both tokens before DynamoDB write
    - Store expiration timestamp and connected email
    - Update integration status to 'connected'
    - _Requirements: 3.3, 3.4, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 2.4 Write property test for token storage
    - **Property 6: Token storage with user association**
    - **Validates: Requirements 3.3, 3.4, 10.3**
  
  - [x] 2.5 Implement token retrieval methods
    - Implement `getTokens(userId): Promise<TokenData>`
    - Retrieve encrypted tokens from DynamoDB
    - Decrypt tokens using KMS
    - Check expiration and trigger refresh if needed
    - _Requirements: 3.5, 4.1, 4.5_
  
  - [ ]* 2.6 Write property test for token ownership
    - **Property 7: Token ownership authorization**
    - **Validates: Requirements 10.4**
  
  - [x] 2.7 Implement automatic token refresh
    - Implement `refreshTokens(userId, refreshToken): Promise<TokenData>`
    - Call Google OAuth token refresh endpoint
    - Encrypt and store new access token
    - Update expiration timestamp in DynamoDB
    - Handle invalid_grant error by marking integration disconnected
    - _Requirements: 4.1, 4.2, 4.3, 4.5_
  
  - [ ]* 2.8 Write property test for automatic token refresh
    - **Property 8: Automatic token refresh**
    - **Validates: Requirements 4.1, 4.2, 4.5**
  
  - [ ]* 2.9 Write property test for refresh failure handling
    - **Property 9: Refresh failure disconnection**
    - **Validates: Requirements 4.3, 8.4**
  
  - [x] 2.10 Implement token deletion and revocation
    - Implement `deleteTokens(userId): Promise<void>`
    - Retrieve tokens from DynamoDB
    - Call Google token revocation endpoint
    - Remove tokens from DynamoDB regardless of revocation result
    - Update integration status to 'disconnected'
    - Log errors if revocation fails but continue deletion
    - _Requirements: 6.2, 6.3, 6.5_
  
  - [ ]* 2.11 Write property test for token removal
    - **Property 12: Token removal on disconnect**
    - **Validates: Requirements 6.2, 6.3**
  
  - [ ]* 2.12 Write property test for graceful revocation failure
    - **Property 13: Graceful revocation failure**
    - **Validates: Requirements 6.5**
  
  - [ ]* 2.13 Write unit tests for TokenManager
    - Test KMS encryption/decryption with mocked KMS
    - Test DynamoDB operations with mocked DynamoDB
    - Test retry logic for transient failures
    - Test error handling for permanent failures
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Checkpoint - Verify Token Manager functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement OAuth Handler Lambda functions
  - [x] 4.1 Create OAuth initiation handler
    - Implement Lambda handler for `/authorize` endpoint
    - Validate Cognito session from authorizer context
    - Generate cryptographically secure state token (32 bytes)
    - Store state token in DynamoDB with 5-minute TTL
    - Build Google OAuth URL with client ID, redirect URI, scopes, and state
    - Return authorization URL to frontend
    - _Requirements: 1.2, 1.3, 1.4, 10.1, 10.2_
  
  - [ ]* 4.2 Write property test for OAuth flow initiation
    - **Property 1: OAuth flow initiation**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
  
  - [ ]* 4.3 Write property test for OAuth scope configuration
    - **Property 2: OAuth scope configuration**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  
  - [x] 4.4 Create OAuth callback handler
    - Implement Lambda handler for `/callback` endpoint
    - Extract code, state, and error from query parameters
    - Validate state token exists in DynamoDB and not expired
    - Retrieve associated Cognito user ID from state token
    - Handle user cancellation (error=access_denied)
    - Exchange authorization code for tokens with Google
    - Call TokenManager to encrypt and store tokens
    - Delete used state token from DynamoDB
    - Redirect to frontend with success or error status
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.2, 8.3_
  
  - [ ]* 4.5 Write property test for state token CSRF protection
    - **Property 3: State token CSRF protection**
    - **Validates: Requirements 2.1, 2.3**
  
  - [ ]* 4.6 Write property test for token exchange
    - **Property 4: Token exchange on valid state**
    - **Validates: Requirements 2.2, 2.5**
  
  - [ ]* 4.7 Write property test for token exchange error handling
    - **Property 16: Token exchange error handling**
    - **Validates: Requirements 2.4**
  
  - [ ]* 4.8 Write unit tests for OAuth handlers
    - Test initiation handler with valid Cognito session
    - Test initiation handler with invalid session
    - Test callback handler with valid state token
    - Test callback handler with invalid state token
    - Test callback handler with user cancellation
    - Test callback handler with token exchange failure
    - Mock Google OAuth endpoints
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 8.1, 8.2, 8.3_

- [x] 5. Implement Integration Status and Disconnect handlers
  - [x] 5.1 Create integration status handler
    - Implement Lambda handler for `/status` endpoint
    - Validate Cognito session from authorizer context
    - Query DynamoDB for user's Gmail integration data
    - Check token expiration status
    - Return status ('connected', 'disconnected', 'expired'), email, and connectedAt
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.3_
  
  - [ ]* 5.2 Write property test for authentication requirement
    - **Property 15: Authentication requirement**
    - **Validates: Requirements 10.1, 10.2**
  
  - [x] 5.3 Create integration disconnect handler
    - Implement Lambda handler for `/disconnect` endpoint
    - Validate Cognito session from authorizer context
    - Call TokenManager.deleteTokens() to remove and revoke tokens
    - Return success response
    - Handle errors gracefully with user-friendly messages
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 5.4 Write unit tests for status and disconnect handlers
    - Test status handler with connected integration
    - Test status handler with disconnected integration
    - Test status handler with expired tokens
    - Test disconnect handler success flow
    - Test disconnect handler with revocation failure
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

- [x] 6. Update CDK infrastructure stack
  - [x] 6.1 Add KMS key to CDK stack
    - Define KMS key resource with encryption configuration
    - Create key alias for easy reference
    - Configure key policy for Lambda access
    - Export key ARN for Lambda environment variables
    - _Requirements: 3.1, 3.2_
  
  - [x] 6.2 Add Lambda functions to CDK stack
    - Create Lambda function for OAuth initiation handler
    - Create Lambda function for OAuth callback handler
    - Create Lambda function for Token Manager
    - Create Lambda function for status handler
    - Create Lambda function for disconnect handler
    - Configure environment variables (KMS key ARN, table name, Google client ID)
    - Grant KMS encrypt/decrypt permissions to all functions
    - Grant DynamoDB read/write permissions to all functions
    - Grant Secrets Manager read permission for Google client secret
    - _Requirements: 1.2, 2.1, 3.1, 3.2, 3.3, 5.4, 6.2_
  
  - [x] 6.3 Add API Gateway resources to CDK stack
    - Create or update API Gateway REST API
    - Add `/integrations/gmail/authorize` resource with GET method
    - Add `/integrations/gmail/callback` resource with GET method
    - Add `/integrations/gmail/status` resource with GET method
    - Add `/integrations/gmail/disconnect` resource with POST method
    - Configure Cognito authorizer for protected endpoints
    - Configure CORS for all endpoints
    - Configure rate limiting and throttling
    - Wire Lambda integrations to API methods
    - _Requirements: 1.2, 2.1, 5.4, 6.2, 10.1_

- [x] 7. Checkpoint - Verify backend infrastructure
  - Ensure CDK synth succeeds, ask the user if questions arise.

- [x] 8. Implement frontend integration UI components
  - [x] 8.1 Create GmailIntegrationCard component
    - Create `frontend/src/components/GmailIntegrationCard.tsx`
    - Define props interface (status, email, connectedAt, error, onConnect, onDisconnect)
    - Render Gmail logo and integration name
    - Display Connect button when status is 'disconnected'
    - Display connected status with email when status is 'connected'
    - Display Disconnect button when status is 'connected'
    - Display error message when status is 'error'
    - Display loading spinner when status is 'connecting'
    - Style with existing design system
    - _Requirements: 1.1, 5.1, 5.2, 5.3, 6.1_
  
  - [ ]* 8.2 Write unit tests for GmailIntegrationCard
    - Test Connect button renders when disconnected
    - Test connected status displays email
    - Test Disconnect button renders when connected
    - Test error message displays correctly
    - Test loading state displays spinner
    - Use React Testing Library and Vitest
    - _Requirements: 1.1, 5.1, 5.2, 5.3, 6.1_
  
  - [x] 8.3 Create API client for Gmail integration endpoints
    - Create `frontend/src/api/gmailIntegration.ts`
    - Implement `initiateOAuth(): Promise<{ authorizationUrl: string }>`
    - Implement `getIntegrationStatus(): Promise<IntegrationStatus>`
    - Implement `disconnectIntegration(): Promise<{ success: boolean }>`
    - Add Cognito token to Authorization header
    - Handle API errors with user-friendly messages
    - _Requirements: 1.2, 5.4, 6.2_
  
  - [x] 8.4 Enhance IntegrationsPage component
    - Update `frontend/src/pages/Integrations.tsx` or create if not exists
    - Add state management for Gmail integration status
    - Implement `handleGmailConnect()` to call API and redirect to OAuth URL
    - Implement `handleGmailDisconnect()` to call disconnect API
    - Implement `fetchIntegrationStatus()` to load status on page load
    - Implement OAuth callback handling (parse URL params on mount)
    - Display success/error messages based on callback params
    - Render GmailIntegrationCard with current status
    - Update status reactively after connect/disconnect
    - _Requirements: 1.1, 1.2, 5.4, 5.5, 6.1, 6.4, 8.1, 8.2, 8.3_
  
  - [ ]* 8.5 Write property test for status fetch on page load
    - **Property 10: Status fetch on page load**
    - **Validates: Requirements 5.4**
  
  - [ ]* 8.6 Write property test for reactive status updates
    - **Property 11: Reactive status updates**
    - **Validates: Requirements 5.5**
  
  - [ ]* 8.7 Write property test for error message persistence
    - **Property 14: Error message persistence**
    - **Validates: Requirements 8.5**
  
  - [ ]* 8.8 Write unit tests for IntegrationsPage
    - Test page loads and fetches status
    - Test Connect button initiates OAuth flow
    - Test OAuth callback success updates UI
    - Test OAuth callback error displays message
    - Test Disconnect button removes integration
    - Test error messages persist for 5+ seconds
    - Mock API client methods
    - Use React Testing Library and Vitest
    - _Requirements: 1.1, 1.2, 5.4, 5.5, 6.1, 6.4, 8.1, 8.2, 8.3, 8.5_

- [x] 9. Checkpoint - Verify frontend components
  - Ensure all frontend tests pass, ask the user if questions arise.

- [x] 10. Implement integration tests
  - [ ]* 10.1 Write end-to-end OAuth flow integration test
    - Mock Google OAuth endpoints
    - Simulate user clicking Connect button
    - Verify OAuth URL generation with state token
    - Simulate Google callback with authorization code
    - Verify tokens are encrypted and stored in DynamoDB
    - Verify UI updates to show connected status
    - Verify tokens can be retrieved and decrypted
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 5.5_
  
  - [ ]* 10.2 Write token refresh integration test
    - Store tokens with past expiration time
    - Attempt to retrieve tokens via TokenManager
    - Verify automatic refresh is triggered
    - Verify new tokens are encrypted and stored
    - Verify old tokens are replaced
    - Mock Google token refresh endpoint
    - _Requirements: 4.1, 4.2, 4.5_
  
  - [ ]* 10.3 Write disconnect flow integration test
    - Store valid tokens for test user
    - Simulate user clicking Disconnect button
    - Verify revocation API is called with Google
    - Verify tokens are removed from DynamoDB
    - Verify UI updates to show disconnected status
    - Test graceful handling of revocation failure
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 10.4 Write authentication integration test
    - Test OAuth initiation with invalid Cognito session
    - Test status check with expired session
    - Test disconnect with missing session
    - Verify 401 responses and redirect to login
    - _Requirements: 10.1, 10.2_

- [x] 11. Add error handling and logging
  - [x] 11.1 Implement structured error logging
    - Add CloudWatch structured logging to all Lambda functions
    - Log OAuth flow events (initiation, callback, success, failure)
    - Log token operations (store, retrieve, refresh, delete)
    - Log authentication failures and security events
    - Never log unencrypted tokens (only last 4 characters for debugging)
    - Include request IDs for tracing
    - _Requirements: 2.4, 3.6, 6.5, 8.1, 8.2, 8.3_
  
  - [x] 11.2 Implement frontend error handling
    - Add error boundary for IntegrationsPage
    - Display user-friendly error messages for all error scenarios
    - Implement 5-second minimum display time for errors
    - Add retry buttons for recoverable errors
    - Log errors to console for debugging
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  
  - [x] 11.3 Configure CloudWatch alarms
    - Create alarm for OAuth callback failures (>5% error rate)
    - Create alarm for token refresh failures (>10% error rate)
    - Create alarm for KMS encryption failures
    - Create alarm for DynamoDB throttling
    - _Requirements: 2.4, 4.3, 8.4_

- [x] 12. Final integration and documentation
  - [x] 12.1 Update environment configuration
    - Add Google OAuth client ID to environment variables
    - Add Google OAuth client secret to Secrets Manager
    - Add OAuth redirect URI to configuration
    - Document required environment variables in README
    - _Requirements: 1.3, 9.1, 9.2, 9.3_
  
  - [x] 12.2 Add integration to navigation
    - Ensure Integrations page is accessible from main navigation
    - Add route for `/integrations` if not exists
    - Update any relevant navigation components
    - _Requirements: 1.1, 5.4_
  
  - [x] 12.3 Verify test coverage
    - Run frontend test coverage report (target: 80%)
    - Run backend test coverage report (target: 90%)
    - Verify all 16 property tests are implemented and passing
    - Verify all integration tests are passing
    - _Requirements: All_

- [x] 13. Final checkpoint - Complete system verification
  - Ensure all tests pass, verify OAuth flow works end-to-end, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using fast-check (100+ iterations each)
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end user flows
- Checkpoints ensure incremental validation at key milestones
- All tokens must be encrypted with KMS before storage
- State tokens provide CSRF protection for OAuth flow
- Automatic token refresh ensures seamless user experience
- Graceful error handling with user-friendly messages throughout

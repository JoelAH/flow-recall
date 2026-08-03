# Implementation Plan: Cognito Google Authentication

## Overview

This implementation plan creates a complete authentication system for FlowRecall using AWS Cognito with Google OAuth. The work is organized into three main phases: database infrastructure, authentication infrastructure, and frontend integration. Each phase builds incrementally, with testing integrated throughout to validate functionality early.

## Tasks

- [x] 1. Set up DatabaseStack with DynamoDB users table
  - Create `backend/lib/database-stack.ts` with DynamoDB table definition
  - Configure table with `internalUserId` as partition key (String)
  - Add Global Secondary Index `cognitoUserIdIndex` with `cognitoUserId` as partition key
  - Set billing mode to PAY_PER_REQUEST
  - Enable point-in-time recovery
  - Export table name and ARN for cross-stack reference
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ]* 1.1 Write CDK assertion tests for DatabaseStack
  - Test table has correct partition key schema
  - Test GSI is configured correctly
  - Test billing mode is PAY_PER_REQUEST
  - Test point-in-time recovery is enabled
  - Test stack exports are defined
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

- [x] 2. Implement Post-Confirmation Lambda function
  - [x] 2.1 Create Lambda function directory structure
    - Create `backend/lambda/post-confirmation/` directory
    - Create `index.ts` with handler function
    - Add `package.json` with uuid dependency
    - _Requirements: 3.1, 3.2_
  
  - [x] 2.2 Implement user record creation logic
    - Extract cognitoUserId from event.request.userAttributes.sub
    - Extract email from event.request.userAttributes.email
    - Generate internalUserId using uuid v4
    - Create ISO timestamp for created and updated fields
    - Write record to DynamoDB with all required fields
    - Set userRole to "ORG_OWNER"
    - Return event on success
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  
  - [x] 2.3 Add error handling and logging
    - Wrap DynamoDB operations in try-catch
    - Log errors with internalUserId, cognitoUserId, email, and error details
    - Log successful user creation for audit
    - Throw errors to prevent Cognito user creation on failure
    - _Requirements: 3.8, 8.2, 8.3, 8.4_
  
  - [ ]* 2.4 Write property test for user record creation completeness
    - **Property 1: User Record Creation Completeness**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
  
  - [ ]* 2.5 Write property test for Lambda error handling
    - **Property 2: Lambda Error Handling**
    - **Validates: Requirements 3.8, 8.2, 8.3**
  
  - [ ]* 2.6 Write property test for success audit logging
    - **Property 5: Success Audit Logging**
    - **Validates: Requirements 8.4**
  
  - [ ]* 2.7 Write unit tests for Lambda edge cases
    - Test missing email attribute handling
    - Test missing sub attribute handling
    - Test UUID v4 format validation
    - Test timestamp format validation
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Create AuthStack with Cognito resources
  - [x] 3.1 Create AuthStack CDK construct
    - Create `backend/lib/auth-stack.ts`
    - Accept DatabaseStack table as prop
    - Define stack interface with usersTable parameter
    - _Requirements: 1.1, 6.1, 6.3_
  
  - [x] 3.2 Configure Cognito User Pool
    - Create user pool with email as username attribute
    - Enable email auto-verification
    - Set sign-in aliases to email
    - Configure standard attributes (email required)
    - Add password policy (minimum 8 characters, require uppercase, lowercase, numbers)
    - _Requirements: 1.1, 7.2_
  
  - [x] 3.3 Configure Cognito User Pool Client
    - Create user pool client
    - Enable authorization code grant OAuth flow
    - Set OAuth scopes: email, profile, openid
    - Configure callback URLs from CDK context (localhost + production)
    - Configure logout URLs from CDK context
    - _Requirements: 1.3, 1.4_
  
  - [x] 3.4 Configure Google Identity Provider
    - Create UserPoolIdentityProviderGoogle
    - Read Google client ID from CDK context
    - Read Google client secret from AWS Systems Manager Parameter Store
    - Map Google email attribute to Cognito email
    - Configure OAuth scopes
    - _Requirements: 1.2, 1.4, 1.5_
  
  - [x] 3.5 Create Cognito User Pool Domain
    - Add user pool domain with configurable prefix
    - Export domain for frontend configuration
    - _Requirements: 1.3_
  
  - [x] 3.6 Wire Post-Confirmation Lambda trigger
    - Create Lambda function from code in lambda/post-confirmation
    - Add uuid as Lambda layer or bundled dependency
    - Set USERS_TABLE_NAME environment variable
    - Grant Lambda write permissions to users table (dynamodb:PutItem)
    - Attach Lambda as post-confirmation trigger to user pool
    - Set timeout to 10 seconds
    - _Requirements: 3.1, 6.4, 7.3_
  
  - [x] 3.7 Export Cognito configuration values
    - Export userPoolId for frontend
    - Export userPoolClientId for frontend
    - Export userPoolDomain for frontend
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [ ]* 3.8 Write CDK assertion tests for AuthStack
    - Test user pool has email username attribute
    - Test user pool client has correct OAuth configuration
    - Test Google identity provider is configured
    - Test Lambda has correct environment variables
    - Test Lambda has IAM permissions to write to users table
    - Test post-confirmation trigger is attached
    - Test stack exports are defined
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.4_

- [x] 4. Update CDK app to instantiate new stacks
  - Modify `backend/bin/backend.ts` to create DatabaseStack
  - Create AuthStack with dependency on DatabaseStack
  - Pass users table from DatabaseStack to AuthStack
  - Configure stack dependencies explicitly
  - Add CDK context for Google client ID and callback URLs
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [x] 5. Checkpoint - Deploy and verify backend infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create frontend authentication configuration
  - [x] 6.1 Create auth configuration file
    - Create `frontend/src/config/auth.js`
    - Export authConfig object with placeholder values
    - Include userPoolId, userPoolClientId, cognitoDomain, redirectUri, logoutUri
    - Add comments explaining values should be replaced after deployment
    - _Requirements: 4.3, 4.4_
  
  - [x] 6.2 Install AWS Amplify dependencies
    - Add `aws-amplify` package to frontend/package.json
    - Add `@aws-amplify/ui-react` for UI components (optional)
    - _Requirements: 4.1, 4.2_

- [x] 7. Implement AuthContext for authentication state management
  - [x] 7.1 Create AuthContext component
    - Create `frontend/src/context/AuthContext.jsx`
    - Define context with isAuthenticated, user, login, logout, loading states
    - Implement AuthProvider component
    - Export useAuth hook for consuming context
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 7.2 Implement token storage and retrieval
    - Store tokens in localStorage with key 'flowrecall_auth_tokens'
    - Include idToken, accessToken, refreshToken, expiresAt
    - Implement getTokens() helper function
    - Implement setTokens() helper function
    - Implement clearTokens() helper function
    - _Requirements: 5.1_
  
  - [x] 7.3 Implement session initialization logic
    - Check localStorage for tokens on AuthProvider mount
    - Validate token expiration
    - Set authenticated state if tokens are valid
    - Redirect to login if tokens are expired
    - _Requirements: 5.2, 5.3, 5.4_
  
  - [x] 7.4 Implement logout function
    - Clear tokens from localStorage
    - Set authenticated state to false
    - Redirect to Cognito logout URL
    - _Requirements: 5.5_
  
  - [ ]* 7.5 Write property test for logout token cleanup
    - **Property 4: Logout Token Cleanup**
    - **Validates: Requirements 5.5**
  
  - [ ]* 7.6 Write unit tests for AuthContext
    - Test initial state is unauthenticated
    - Test tokens are loaded from localStorage on mount
    - Test expired tokens trigger redirect
    - Test logout clears tokens
    - Mock localStorage for testing
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Implement Login component
  - [x] 8.1 Create Login page component
    - Create `frontend/src/pages/Login.jsx`
    - Create `frontend/src/pages/Login.css` for styling
    - Render "Sign in with Google" button
    - _Requirements: 4.1_
  
  - [x] 8.2 Implement OAuth redirect logic
    - Build Cognito hosted UI URL with correct parameters
    - Include client_id, response_type=code, scope, redirect_uri
    - Redirect to Cognito on button click
    - _Requirements: 4.3_
  
  - [x] 8.3 Implement OAuth callback handling
    - Check URL for authorization code parameter
    - Exchange code for tokens using Cognito token endpoint
    - Store tokens in localStorage via AuthContext
    - Redirect to main app on success
    - Display error message on failure
    - _Requirements: 4.4, 4.5, 8.1_
  
  - [ ]* 8.4 Write property test for authentication redirect parameters
    - **Property 3: Authentication Redirect Parameters**
    - **Validates: Requirements 4.3**
  
  - [ ]* 8.5 Write unit tests for Login component
    - Test component renders "Sign in with Google" button
    - Test button click triggers redirect
    - Test callback with code exchanges for tokens
    - Test callback with error displays error message
    - Mock window.location and fetch for testing
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

- [x] 9. Implement Signup component
  - Create `frontend/src/pages/Signup.jsx`
  - Render "Sign up with Google" button
  - Use same OAuth redirect logic as Login with signup parameter
  - Share callback handling with Login component
  - _Requirements: 4.2_

- [ ]* 9.1 Write unit tests for Signup component
  - Test component renders "Sign up with Google" button
  - Test button click triggers redirect with signup parameter
  - _Requirements: 4.2_

- [x] 10. Create ProtectedRoute component
  - Create `frontend/src/components/ProtectedRoute.jsx`
  - Check authentication state from AuthContext
  - Redirect to login if not authenticated
  - Show loading state while checking auth
  - Render children if authenticated
  - _Requirements: 5.2, 5.3, 5.4_

- [ ]* 10.1 Write unit tests for ProtectedRoute
  - Test redirects to login when unauthenticated
  - Test renders children when authenticated
  - Test shows loading state while checking
  - Mock AuthContext for testing
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 11. Integrate authentication into App component
  - Wrap App with AuthProvider
  - Add routes for /login and /signup
  - Add route for /callback (OAuth callback handler)
  - Wrap existing routes with ProtectedRoute
  - Add logout button to main UI
  - _Requirements: 4.1, 4.2, 4.4, 5.5_

- [x] 12. Final checkpoint - End-to-end testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Backend uses TypeScript, frontend uses JSX (not TypeScript)
- Google OAuth credentials must be configured before deployment
- Frontend configuration values must be updated after CDK deployment

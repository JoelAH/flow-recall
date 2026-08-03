# Requirements Document

## Introduction

The Slack Integration feature enables users to connect their Slack workspace to FlowRecall, allowing the system to access and analyze Slack messages and threads. This integration follows the same OAuth-based pattern as the existing Gmail integration, storing encrypted credentials in DynamoDB and providing a user interface for connection management.

## Glossary

- **Slack_Integration_System**: The complete system handling Slack OAuth flow, token management, and API interactions
- **OAuth_Initiation_Handler**: Lambda function that generates authorization URLs and state tokens for Slack OAuth
- **OAuth_Callback_Handler**: Lambda function that processes Slack's OAuth redirect and exchanges authorization codes for tokens
- **Token_Manager**: Component responsible for encrypting and storing OAuth tokens using KMS
- **Integration_Card**: UI component displaying Slack connection status and controls
- **State_Token**: Cryptographically secure token used for CSRF protection during OAuth flow
- **User_Record**: DynamoDB record containing user data including OAuth tokens and integration status
- **KMS_Key**: AWS Key Management Service key used for encrypting OAuth tokens at rest
- **Workspace**: A Slack workspace that the user has access to and wishes to connect

## Requirements

### Requirement 1: OAuth Flow Initiation

**User Story:** As a user, I want to initiate a Slack connection from the integrations page, so that I can authorize FlowRecall to access my Slack workspace.

#### Acceptance Criteria

1. WHEN a user clicks the Connect button on the Slack Integration Card, THE Integration_Card SHALL display a connecting state
2. WHEN the OAuth initiation is requested, THE OAuth_Initiation_Handler SHALL generate a cryptographically secure State_Token with 32 bytes of entropy
3. WHEN the State_Token is generated, THE OAuth_Initiation_Handler SHALL encode the user's Cognito ID in the State_Token for efficient lookup
4. WHEN the State_Token is created, THE OAuth_Initiation_Handler SHALL store the State_Token in the User_Record with a 5-minute expiration time
5. WHEN the State_Token is stored, THE OAuth_Initiation_Handler SHALL return a Slack authorization URL containing the State_Token, client ID, redirect URI, and required scopes
6. WHEN the authorization URL is received, THE Integration_Card SHALL redirect the user's browser to the Slack authorization URL

### Requirement 2: OAuth Credentials Management

**User Story:** As a system administrator, I want Slack OAuth credentials stored securely in AWS Parameter Store, so that they are encrypted and managed separately from application code.

#### Acceptance Criteria

1. THE Slack_Integration_System SHALL retrieve the Slack client ID from AWS Systems Manager Parameter Store at path /flowrecall/slack-oauth-client-id
2. THE Slack_Integration_System SHALL retrieve the Slack client secret from AWS Systems Manager Parameter Store at path /flowrecall/slack-oauth-client-secret
3. WHEN OAuth credentials are retrieved, THE Slack_Integration_System SHALL cache the credentials in memory for the Lambda execution context lifetime
4. IF OAuth credentials are not found in Parameter Store, THEN THE Slack_Integration_System SHALL return an error indicating service unavailability

### Requirement 3: OAuth Callback Processing

**User Story:** As a user, I want the system to securely process Slack's OAuth callback, so that my workspace connection is established without exposing sensitive tokens.

#### Acceptance Criteria

1. WHEN Slack redirects to the callback endpoint with an authorization code and state parameter, THE OAuth_Callback_Handler SHALL extract the Cognito user ID from the State_Token
2. WHEN the user ID is extracted, THE OAuth_Callback_Handler SHALL validate that the State_Token exists in the User_Record and has not expired
3. IF the State_Token is invalid or expired, THEN THE OAuth_Callback_Handler SHALL redirect to the frontend with an invalid_state error
4. WHEN the State_Token is validated, THE OAuth_Callback_Handler SHALL exchange the authorization code for access and refresh tokens using Slack's OAuth API
5. IF the token exchange fails, THEN THE OAuth_Callback_Handler SHALL redirect to the frontend with a token_exchange_failed error
6. WHEN tokens are received from Slack, THE OAuth_Callback_Handler SHALL retrieve the workspace name and user's Slack identity using the access token
7. WHEN tokens and workspace information are retrieved, THE Token_Manager SHALL encrypt the tokens using the KMS_Key
8. WHEN tokens are encrypted, THE Token_Manager SHALL store the encrypted tokens, workspace name, and connection timestamp in the User_Record
9. WHEN tokens are stored successfully, THE OAuth_Callback_Handler SHALL delete the used State_Token from the User_Record
10. WHEN the OAuth flow completes successfully, THE OAuth_Callback_Handler SHALL redirect to the frontend integrations page with a success indicator

### Requirement 4: User Cancellation Handling

**User Story:** As a user, I want to be able to cancel the Slack authorization process, so that I can return to the integrations page without connecting.

#### Acceptance Criteria

1. WHEN Slack redirects to the callback endpoint with an error parameter equal to access_denied, THE OAuth_Callback_Handler SHALL redirect to the frontend with a cancelled status
2. WHEN the frontend receives a cancelled status, THE Integration_Card SHALL display a message indicating the connection was cancelled
3. WHEN a cancellation occurs, THE Slack_Integration_System SHALL not modify the User_Record's integration status

### Requirement 5: Token Encryption and Storage

**User Story:** As a security-conscious user, I want my Slack OAuth tokens encrypted at rest, so that my workspace access credentials are protected from unauthorized access.

#### Acceptance Criteria

1. WHEN OAuth tokens are received, THE Token_Manager SHALL encrypt the access token using the KMS_Key with AES-256-GCM encryption
2. WHEN the access token is encrypted, THE Token_Manager SHALL encrypt the refresh token using the KMS_Key with AES-256-GCM encryption
3. WHEN tokens are encrypted, THE Token_Manager SHALL store the encrypted tokens in the User_Record under a slackIntegration attribute
4. WHEN storing encrypted tokens, THE Token_Manager SHALL include the workspace name, workspace ID, connected user's Slack ID, and ISO 8601 timestamp
5. WHEN tokens are stored, THE Token_Manager SHALL calculate and store the access token expiration time based on Slack's expires_in value
6. THE KMS_Key SHALL have automatic annual key rotation enabled
7. THE KMS_Key SHALL have a retention policy that prevents deletion when the CDK stack is destroyed

### Requirement 6: Integration Status Checking

**User Story:** As a user, I want to see my current Slack connection status when I visit the integrations page, so that I know whether my workspace is connected.

#### Acceptance Criteria

1. WHEN the integrations page loads, THE Integration_Card SHALL request the current Slack integration status from the backend
2. WHEN a status request is received, THE Slack_Integration_System SHALL retrieve the User_Record for the authenticated user
3. IF the User_Record contains valid Slack integration data with encrypted tokens, THEN THE Slack_Integration_System SHALL return a connected status with workspace name and connection timestamp
4. IF the User_Record does not contain Slack integration data, THEN THE Slack_Integration_System SHALL return a disconnected status
5. IF the User_Record contains Slack integration data but tokens are missing or corrupted, THEN THE Slack_Integration_System SHALL return an error status
6. WHEN a connected status is received, THE Integration_Card SHALL display the workspace name and relative connection time
7. WHEN a disconnected status is received, THE Integration_Card SHALL display a Connect button
8. WHEN an error status is received, THE Integration_Card SHALL display an error message and a Retry Connection button

### Requirement 7: Integration Disconnection

**User Story:** As a user, I want to disconnect my Slack workspace from FlowRecall, so that the system no longer has access to my Slack data.

#### Acceptance Criteria

1. WHEN a user clicks the Disconnect button, THE Integration_Card SHALL display a connecting state
2. WHEN a disconnect request is received, THE Slack_Integration_System SHALL retrieve the encrypted tokens from the User_Record
3. WHEN encrypted tokens are retrieved, THE Token_Manager SHALL decrypt the access token using the KMS_Key
4. WHEN the access token is decrypted, THE Slack_Integration_System SHALL revoke the token using Slack's auth.revoke API endpoint
5. IF token revocation fails due to an already-revoked token, THEN THE Slack_Integration_System SHALL proceed with local cleanup
6. WHEN token revocation completes or is skipped, THE Slack_Integration_System SHALL remove the slackIntegration attribute from the User_Record
7. WHEN the User_Record is updated, THE Slack_Integration_System SHALL return a success response
8. WHEN a successful disconnect response is received, THE Integration_Card SHALL display a disconnected state with a success message
9. IF the disconnect operation fails, THEN THE Integration_Card SHALL display an error message and refresh the integration status

### Requirement 8: API Gateway Configuration

**User Story:** As a system operator, I want the Slack integration API properly configured with authentication and rate limiting, so that the service is secure and performs reliably.

#### Acceptance Criteria

1. THE Slack_Integration_System SHALL expose a GET endpoint at /api/integrations/slack/authorize protected by Cognito authentication
2. THE Slack_Integration_System SHALL expose a GET endpoint at /api/integrations/slack/callback with no authentication requirement
3. THE Slack_Integration_System SHALL expose a GET endpoint at /api/integrations/slack/status protected by Cognito authentication
4. THE Slack_Integration_System SHALL expose a POST endpoint at /api/integrations/slack/disconnect protected by Cognito authentication
5. THE Slack_Integration_System SHALL apply a rate limit of 10 requests per second per user to all endpoints
6. THE Slack_Integration_System SHALL apply a burst limit of 20 requests to all endpoints
7. THE Slack_Integration_System SHALL apply a quota of 1000 requests per day per user
8. THE Slack_Integration_System SHALL enable CORS for localhost:5173 and app.flowrecall.com origins
9. THE Slack_Integration_System SHALL set API Gateway timeout to 10 seconds for authorize and status endpoints
10. THE Slack_Integration_System SHALL set API Gateway timeout to 30 seconds for callback and disconnect endpoints

### Requirement 9: OAuth Scopes

**User Story:** As a user, I want FlowRecall to request only the necessary Slack permissions, so that I understand what data the system can access.

#### Acceptance Criteria

1. THE OAuth_Initiation_Handler SHALL request the channels:history scope to read messages from public channels
2. THE OAuth_Initiation_Handler SHALL request the groups:history scope to read messages from private channels the user has access to
3. THE OAuth_Initiation_Handler SHALL request the im:history scope to read direct messages
4. THE OAuth_Initiation_Handler SHALL request the mpim:history scope to read multi-party direct messages
5. THE OAuth_Initiation_Handler SHALL request the users:read scope to identify the connected user
6. THE OAuth_Initiation_Handler SHALL request the team:read scope to identify the workspace
7. THE OAuth_Initiation_Handler SHALL request the channels:read scope to list available channels
8. THE OAuth_Initiation_Handler SHALL request the groups:read scope to list available private channels

### Requirement 10: Frontend Integration UI

**User Story:** As a user, I want a clear and intuitive interface for managing my Slack connection, so that I can easily connect, monitor, and disconnect my workspace.

#### Acceptance Criteria

1. THE Integration_Card SHALL display a Slack icon and description explaining the integration purpose
2. WHEN the integration status is disconnected, THE Integration_Card SHALL display a Connect button
3. WHEN the integration status is connecting, THE Integration_Card SHALL display a loading spinner and "Connecting..." text
4. WHEN the integration status is connected, THE Integration_Card SHALL display a connected badge, workspace name, and connection timestamp
5. WHEN the integration status is connected, THE Integration_Card SHALL display a Disconnect button
6. WHEN the integration status is error, THE Integration_Card SHALL display an error icon, error message, and Retry Connection button
7. WHEN an OAuth callback completes successfully, THE Integration_Card SHALL display a success message that auto-dismisses after 5 seconds
8. WHEN an OAuth callback fails, THE Integration_Card SHALL display an error message that auto-dismisses after 5 seconds
9. THE Integration_Card SHALL format connection timestamps as relative time (e.g., "2 hours ago", "3 days ago")

### Requirement 11: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages when something goes wrong, so that I understand what happened and how to resolve it.

#### Acceptance Criteria

1. WHEN an OAuth initiation fails due to missing credentials, THE Slack_Integration_System SHALL return a service_unavailable error with a retryable flag
2. WHEN an OAuth callback receives an invalid state token, THE Slack_Integration_System SHALL return an invalid_state error with a descriptive message
3. WHEN a token exchange fails, THE Slack_Integration_System SHALL return a token_exchange_failed error with a descriptive message
4. WHEN token storage fails, THE Slack_Integration_System SHALL return a storage_failed error with a retryable flag
5. WHEN a disconnect operation fails to revoke tokens, THE Slack_Integration_System SHALL log the error but proceed with local cleanup
6. WHEN the frontend receives an error response, THE Integration_Card SHALL display a user-friendly error message based on the error code
7. WHEN a network error occurs, THE Integration_Card SHALL display a generic error message and suggest retrying

### Requirement 12: Infrastructure as Code

**User Story:** As a developer, I want the Slack integration infrastructure defined in CDK, so that it can be deployed consistently across environments.

#### Acceptance Criteria

1. THE Slack_Integration_System SHALL be defined in a SlackIntegrationStack CDK construct
2. THE SlackIntegrationStack SHALL create Lambda functions for authorize, callback, status, and disconnect handlers
3. THE SlackIntegrationStack SHALL create an API Gateway REST API with the required endpoints
4. THE SlackIntegrationStack SHALL create a Cognito authorizer for protected endpoints
5. THE SlackIntegrationStack SHALL grant Lambda functions read/write access to the Users DynamoDB table
6. THE SlackIntegrationStack SHALL grant Lambda functions read access to Slack OAuth credential parameters in Parameter Store
7. THE SlackIntegrationStack SHALL grant callback and disconnect Lambda functions encrypt/decrypt permissions on the KMS_Key
8. THE SlackIntegrationStack SHALL output the API Gateway URL, KMS key ARN, and Parameter Store paths as CloudFormation outputs
9. THE SlackIntegrationStack SHALL use the same KMS_Key as the Gmail integration for OAuth token encryption
10. THE SlackIntegrationStack SHALL configure Lambda functions with Node.js 22.x runtime and appropriate timeout values

### Requirement 13: DynamoDB Schema

**User Story:** As a developer, I want the Slack integration data stored in a consistent schema, so that it can be reliably accessed and maintained.

#### Acceptance Criteria

1. THE User_Record SHALL contain a slackIntegration attribute of type Map when a Slack workspace is connected
2. THE slackIntegration Map SHALL contain an encryptedAccessToken attribute of type String
3. THE slackIntegration Map SHALL contain an encryptedRefreshToken attribute of type String
4. THE slackIntegration Map SHALL contain a workspaceName attribute of type String
5. THE slackIntegration Map SHALL contain a workspaceId attribute of type String
6. THE slackIntegration Map SHALL contain a userId attribute of type String representing the Slack user ID
7. THE slackIntegration Map SHALL contain a connectedAt attribute of type String in ISO 8601 format
8. THE slackIntegration Map SHALL contain an expiresAt attribute of type Number representing the access token expiration timestamp
9. THE User_Record SHALL contain an oauthStateTokens attribute of type Map for storing State_Tokens with expiration times
10. WHEN a Slack integration is disconnected, THE slackIntegration attribute SHALL be removed from the User_Record

### Requirement 14: Redirect URI Construction

**User Story:** As a developer, I want OAuth redirect URIs constructed dynamically at runtime, so that the same code works across different deployment environments without circular dependencies.

#### Acceptance Criteria

1. WHEN constructing a redirect URI, THE OAuth_Initiation_Handler SHALL extract the API Gateway ID from the Lambda event context
2. WHEN the API Gateway ID is extracted, THE OAuth_Initiation_Handler SHALL extract the stage name from the Lambda event context
3. WHEN the stage name is extracted, THE OAuth_Initiation_Handler SHALL construct the redirect URI in the format https://{apiId}.execute-api.{region}.amazonaws.com/{stage}/api/integrations/slack/callback
4. WHEN the redirect URI is constructed, THE OAuth_Initiation_Handler SHALL include it in the Slack authorization URL
5. WHEN processing a callback, THE OAuth_Callback_Handler SHALL construct the same redirect URI format for token exchange with Slack

### Requirement 15: Logging and Observability

**User Story:** As a developer, I want comprehensive logging of the OAuth flow, so that I can troubleshoot issues and monitor system health.

#### Acceptance Criteria

1. WHEN an OAuth initiation request is received, THE OAuth_Initiation_Handler SHALL log the request ID and user ID
2. WHEN a State_Token is generated, THE OAuth_Initiation_Handler SHALL log the token creation and expiration time
3. WHEN an OAuth callback is received, THE OAuth_Callback_Handler SHALL log the request ID and extracted user ID
4. WHEN State_Token validation fails, THE OAuth_Callback_Handler SHALL log the failure reason and token details
5. WHEN token exchange with Slack fails, THE OAuth_Callback_Handler SHALL log the error response from Slack
6. WHEN tokens are successfully stored, THE OAuth_Callback_Handler SHALL log the success event with workspace name
7. WHEN a disconnect operation is performed, THE Slack_Integration_System SHALL log the user ID and revocation result
8. WHEN KMS encryption or decryption fails, THE Token_Manager SHALL log the error with key ID
9. THE Slack_Integration_System SHALL use structured logging with consistent field names for request ID, user ID, and operation type
10. THE Slack_Integration_System SHALL not log sensitive data including tokens, authorization codes, or encryption keys

# Requirements Document

## Introduction

This document defines the requirements for Gmail integration in FlowRecall. The integration enables users to connect their Gmail accounts through OAuth 2.0, allowing FlowRecall to access and process email communications for timeline reconstruction and catch-up brief generation. The system will securely store OAuth tokens, handle token refresh, and maintain integration status.

## Glossary

- **Gmail_Integration_System**: The complete system handling Gmail OAuth flow, token management, and API access
- **OAuth_Handler**: Backend Lambda function that processes OAuth callbacks and token exchange
- **Token_Manager**: Component responsible for encrypting, storing, and refreshing OAuth tokens
- **Integration_UI**: Frontend interface on the Integrations page for connecting Gmail
- **User_Table**: DynamoDB table storing user data including OAuth tokens
- **Gmail_API**: Google's REST API for accessing Gmail data
- **Access_Token**: Short-lived OAuth token for Gmail API requests
- **Refresh_Token**: Long-lived OAuth token for obtaining new access tokens
- **Cognito_User**: Authenticated user in AWS Cognito identity system

## Requirements

### Requirement 1: OAuth Connection Initiation

**User Story:** As a FlowRecall user, I want to click a Connect button for Gmail, so that I can authorize FlowRecall to access my email communications.

#### Acceptance Criteria

1. THE Integration_UI SHALL display a Connect button for Gmail when no active connection exists
2. WHEN the Connect button is clicked, THE Integration_UI SHALL initiate the OAuth 2.0 authorization flow with Gmail_API
3. THE Integration_UI SHALL include the required OAuth scopes for reading Gmail messages and metadata
4. THE Integration_UI SHALL pass the Cognito_User identifier as state parameter to prevent CSRF attacks
5. WHEN the OAuth flow is initiated, THE Integration_UI SHALL redirect the user to Google's authorization page

### Requirement 2: OAuth Callback Processing

**User Story:** As a FlowRecall user, I want the system to handle Google's authorization response, so that my Gmail account is successfully connected.

#### Acceptance Criteria

1. WHEN Google redirects back with an authorization code, THE OAuth_Handler SHALL validate the state parameter matches the Cognito_User identifier
2. WHEN the state parameter is valid, THE OAuth_Handler SHALL exchange the authorization code for Access_Token and Refresh_Token
3. IF the state parameter is invalid, THEN THE OAuth_Handler SHALL reject the request and return an error
4. IF the token exchange fails, THEN THE OAuth_Handler SHALL log the error and return a user-friendly error message
5. WHEN tokens are successfully obtained, THE OAuth_Handler SHALL pass them to Token_Manager for storage

### Requirement 3: Secure Token Storage

**User Story:** As a security-conscious user, I want my Gmail OAuth tokens stored securely, so that my email access credentials are protected.

#### Acceptance Criteria

1. WHEN storing tokens, THE Token_Manager SHALL encrypt the Access_Token using AWS KMS
2. WHEN storing tokens, THE Token_Manager SHALL encrypt the Refresh_Token using AWS KMS
3. THE Token_Manager SHALL store encrypted tokens in the User_Table associated with the Cognito_User identifier
4. THE Token_Manager SHALL store the token expiration timestamp in the User_Table
5. WHEN retrieving tokens, THE Token_Manager SHALL decrypt them using AWS KMS before returning
6. THE Token_Manager SHALL never log or expose unencrypted token values

### Requirement 4: Token Refresh Mechanism

**User Story:** As a FlowRecall user, I want my Gmail connection to remain active without re-authorization, so that I don't have to reconnect frequently.

#### Acceptance Criteria

1. WHEN an Access_Token is expired, THE Token_Manager SHALL use the Refresh_Token to obtain a new Access_Token from Gmail_API
2. WHEN a new Access_Token is obtained, THE Token_Manager SHALL encrypt and update it in the User_Table
3. IF the Refresh_Token is invalid or expired, THEN THE Token_Manager SHALL mark the integration as disconnected
4. WHEN the integration is marked as disconnected, THE Integration_UI SHALL display the Connect button again
5. THE Token_Manager SHALL check token expiration before each Gmail_API request

### Requirement 5: Integration Status Display

**User Story:** As a FlowRecall user, I want to see my Gmail connection status, so that I know whether my integration is active.

#### Acceptance Criteria

1. WHEN a valid Gmail connection exists, THE Integration_UI SHALL display "Connected" status with the connected email address
2. WHEN no Gmail connection exists, THE Integration_UI SHALL display the Connect button
3. WHEN a Gmail connection is expired or invalid, THE Integration_UI SHALL display "Disconnected" status with a Reconnect button
4. THE Integration_UI SHALL fetch the current connection status when the Integrations page loads
5. WHEN the user successfully connects Gmail, THE Integration_UI SHALL update the status without requiring a page refresh

### Requirement 6: Integration Disconnection

**User Story:** As a FlowRecall user, I want to disconnect my Gmail account, so that I can revoke FlowRecall's access to my email.

#### Acceptance Criteria

1. WHEN a Gmail connection is active, THE Integration_UI SHALL display a Disconnect button
2. WHEN the Disconnect button is clicked, THE Gmail_Integration_System SHALL remove the encrypted tokens from the User_Table
3. WHEN the Disconnect button is clicked, THE Gmail_Integration_System SHALL revoke the tokens with Gmail_API
4. WHEN disconnection is complete, THE Integration_UI SHALL display the Connect button
5. IF token revocation fails, THEN THE Gmail_Integration_System SHALL still remove tokens from User_Table and log the error

### Requirement 7: User Table Schema Extension

**User Story:** As a system administrator, I want the User_Table to store Gmail OAuth tokens, so that the system can maintain persistent Gmail connections.

#### Acceptance Criteria

1. THE User_Table SHALL include a field for encrypted Access_Token
2. THE User_Table SHALL include a field for encrypted Refresh_Token
3. THE User_Table SHALL include a field for token expiration timestamp
4. THE User_Table SHALL include a field for connected Gmail email address
5. THE User_Table SHALL include a field for integration status (connected, disconnected, error)
6. THE User_Table SHALL use the Cognito_User identifier as the primary key for token lookups

### Requirement 8: Error Handling and User Feedback

**User Story:** As a FlowRecall user, I want clear error messages when Gmail connection fails, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. IF the OAuth flow is cancelled by the user, THEN THE Integration_UI SHALL display "Connection cancelled" message
2. IF the OAuth flow fails due to network error, THEN THE Integration_UI SHALL display "Connection failed, please try again" message
3. IF the OAuth flow fails due to invalid credentials, THEN THE Integration_UI SHALL display "Authorization failed, please check your Google account" message
4. IF token refresh fails, THEN THE Gmail_Integration_System SHALL mark the integration as disconnected and notify the user
5. THE Integration_UI SHALL display error messages for at least 5 seconds before allowing retry

### Requirement 9: OAuth Scope Configuration

**User Story:** As a FlowRecall developer, I want to request only necessary Gmail permissions, so that users trust the integration and grant access.

#### Acceptance Criteria

1. THE Gmail_Integration_System SHALL request the gmail.readonly scope for read-only access to messages
2. THE Gmail_Integration_System SHALL request the gmail.metadata scope for accessing message metadata
3. THE Gmail_Integration_System SHALL request the userinfo.email scope for identifying the connected account
4. THE Gmail_Integration_System SHALL not request write or send permissions
5. THE Integration_UI SHALL display the requested permissions to users before initiating OAuth flow

### Requirement 10: Cognito Integration

**User Story:** As a FlowRecall user, I want Gmail integration to work seamlessly with my existing login, so that I don't need separate authentication.

#### Acceptance Criteria

1. WHEN initiating OAuth flow, THE Gmail_Integration_System SHALL verify the user has a valid Cognito session
2. IF the Cognito session is invalid or expired, THEN THE Gmail_Integration_System SHALL redirect to login before OAuth flow
3. THE OAuth_Handler SHALL associate Gmail tokens with the authenticated Cognito_User identifier
4. WHEN retrieving tokens, THE Token_Manager SHALL verify the requesting user matches the token owner
5. THE Gmail_Integration_System SHALL use Cognito user attributes to store integration metadata

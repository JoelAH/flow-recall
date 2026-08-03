# Requirements Document: Cognito Google Authentication

## Introduction

This feature implements user authentication for the FlowRecall application using AWS Cognito with Google OAuth as the identity provider. The system will handle user signup, login, and automatic user record creation in DynamoDB, maintaining clean separation between authentication, database, and frontend layers.

## Glossary

- **Cognito_Service**: AWS Cognito user pool and identity provider configuration
- **Auth_Frontend**: React-based login and signup UI components
- **User_Database**: DynamoDB table storing user profile information
- **User_Record**: A database entry containing internalUserId, cognitoUserId, email, userRole, created, and updated fields
- **Post_Confirmation_Trigger**: Lambda function that executes after successful user signup
- **Google_OAuth**: Google's OAuth 2.0 authentication provider
- **ORG_OWNER**: Default user role assigned to new signups
- **internalUserId**: FlowRecall's internal unique identifier for users (UUID v4)
- **cognitoUserId**: AWS Cognito's unique identifier for users (sub claim from JWT)

## Requirements

### Requirement 1: Cognito User Pool Configuration

**User Story:** As a system administrator, I want a properly configured Cognito user pool with Google OAuth, so that users can authenticate securely using their Google accounts.

#### Acceptance Criteria

1. THE Cognito_Service SHALL create a user pool with email as the username attribute
2. THE Cognito_Service SHALL configure Google as an OAuth identity provider
3. THE Cognito_Service SHALL define callback URLs for the frontend application
4. THE Cognito_Service SHALL enable required OAuth scopes (email, profile, openid)
5. WHERE Google OAuth is configured, THE Cognito_Service SHALL store Google client ID and client secret securely

### Requirement 2: DynamoDB User Table

**User Story:** As a developer, I want a dedicated DynamoDB table for user data, so that user information is stored separately from authentication concerns.

#### Acceptance Criteria

1. THE User_Database SHALL create a table named "users" with internalUserId as the partition key
2. THE User_Database SHALL support attributes: internalUserId, cognitoUserId, email, userRole, created, and updated
3. THE User_Database SHALL use on-demand billing mode for cost efficiency
4. THE User_Database SHALL enable point-in-time recovery for data protection
5. THE User_Database SHALL be defined in a separate CDK stack from authentication resources
6. THE User_Database SHALL create a Global Secondary Index on cognitoUserId for lookup by Cognito identifier

### Requirement 3: Automatic User Record Creation

**User Story:** As a new user, I want my profile automatically created when I sign up, so that I can immediately use the application without manual provisioning.

#### Acceptance Criteria

1. WHEN a user completes signup via Google OAuth, THE Post_Confirmation_Trigger SHALL execute automatically
2. WHEN the Post_Confirmation_Trigger executes, THE system SHALL create a User_Record in the User_Database
3. THE Post_Confirmation_Trigger SHALL generate a unique internalUserId using UUID v4
4. THE Post_Confirmation_Trigger SHALL populate cognitoUserId from the Cognito user identifier (sub claim)
5. THE Post_Confirmation_Trigger SHALL populate email from the Cognito user attributes
6. THE Post_Confirmation_Trigger SHALL set userRole to "ORG_OWNER" for all new signups
7. THE Post_Confirmation_Trigger SHALL set created and updated timestamps to the current time
8. IF the User_Record creation fails, THEN THE Post_Confirmation_Trigger SHALL log the error and return a failure response

### Requirement 4: Frontend Authentication UI

**User Story:** As a user, I want login and signup pages, so that I can authenticate with my Google account through a clear interface.

#### Acceptance Criteria

1. THE Auth_Frontend SHALL provide a login page with a "Sign in with Google" button
2. THE Auth_Frontend SHALL provide a signup page with a "Sign up with Google" button
3. WHEN a user clicks the authentication button, THE Auth_Frontend SHALL redirect to the Cognito hosted UI
4. WHEN authentication succeeds, THE Auth_Frontend SHALL receive and store authentication tokens
5. WHEN authentication fails, THE Auth_Frontend SHALL display an appropriate error message
6. THE Auth_Frontend SHALL use React 19.2.0 with TypeScript and TSX

### Requirement 5: Authentication State Management

**User Story:** As a user, I want my authentication state preserved across sessions, so that I don't need to log in repeatedly.

#### Acceptance Criteria

1. WHEN a user successfully authenticates, THE Auth_Frontend SHALL store tokens securely in browser storage
2. WHEN the application loads, THE Auth_Frontend SHALL check for valid authentication tokens
3. WHEN tokens are valid, THE Auth_Frontend SHALL restore the authenticated session
4. WHEN tokens are expired, THE Auth_Frontend SHALL redirect to the login page
5. THE Auth_Frontend SHALL provide a logout function that clears authentication tokens

### Requirement 6: Infrastructure Separation of Concerns

**User Story:** As a developer, I want clear separation between authentication and database infrastructure, so that the system is maintainable and follows AWS best practices.

#### Acceptance Criteria

1. THE system SHALL define Cognito resources in a dedicated CDK stack
2. THE system SHALL define DynamoDB resources in a separate CDK stack
3. THE system SHALL use CDK stack exports to share resource references between stacks
4. THE system SHALL grant the Post_Confirmation_Trigger appropriate IAM permissions to write to the User_Database
5. THE system SHALL follow the existing project structure with stacks in backend/lib/

### Requirement 7: Security and Access Control

**User Story:** As a security administrator, I want proper security controls on authentication and data access, so that user data is protected.

#### Acceptance Criteria

1. THE Cognito_Service SHALL enforce HTTPS for all authentication endpoints
2. THE Cognito_Service SHALL use secure password policies (minimum length, complexity requirements)
3. THE Post_Confirmation_Trigger SHALL have least-privilege IAM permissions (write-only to User_Database)
4. THE system SHALL not expose Google OAuth client secrets in frontend code
5. THE User_Database SHALL encrypt data at rest using AWS managed keys

### Requirement 8: Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can troubleshoot authentication issues.

#### Acceptance Criteria

1. WHEN authentication errors occur, THE Auth_Frontend SHALL display user-friendly error messages
2. WHEN the Post_Confirmation_Trigger fails, THE system SHALL log detailed error information to CloudWatch
3. WHEN DynamoDB write operations fail, THE Post_Confirmation_Trigger SHALL include the error details in logs
4. THE system SHALL log successful user creation events for audit purposes
5. IF Google OAuth configuration is invalid, THEN THE Cognito_Service SHALL fail deployment with a clear error message

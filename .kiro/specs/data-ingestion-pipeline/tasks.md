# Implementation Plan: Data Ingestion Pipeline

## Overview

This implementation plan breaks down the Data Ingestion Pipeline into discrete coding tasks. The pipeline enables asynchronous retrieval, normalization, and storage of workplace communications (Gmail and Slack) with job status tracking. Implementation follows an incremental approach: infrastructure setup, shared utilities, Lambda functions, frontend components, and comprehensive testing.

## Tasks

- [x] 1. Set up DynamoDB tables and CDK infrastructure
  - [x] 1.1 Create Jobs table with GSI for user status queries
    - Define Jobs table schema with jobId as partition key
    - Add UserIdStatusIndex GSI (userId + status) for concurrent job counting
    - Add UserIdCreatedAtIndex GSI (userId + createdAt) for chronological listing
    - Configure PAY_PER_REQUEST billing mode
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.3_
  
  - [x] 1.2 Create Messages table with GSI for chronological queries
    - Define Messages table schema with jobId as partition key and messageId as sort key
    - Add JobIdTimestampIndex GSI for chronological message retrieval
    - Add JobIdDeduplicationHashIndex GSI for deduplication checks
    - Configure PAY_PER_REQUEST billing mode
    - _Requirements: 4.3, 9.1, 9.2_
  
  - [x] 1.3 Create API Gateway endpoints and Lambda function placeholders
    - Define POST /api/jobs endpoint with Cognito authorization
    - Define GET /api/jobs/:jobId endpoint with Cognito authorization
    - Create placeholder Lambda functions (Create Job, Process Job, Get Status)
    - Configure CORS for frontend integration
    - Set up CloudWatch log groups for each Lambda
    - _Requirements: 1.5, 6.1_

- [x] 2. Implement shared validation and normalization utilities
  - [x] 2.1 Create date validation utilities
    - Implement ISO 8601 date format validation
    - Implement date range validation (startDate ≤ endDate)
    - Implement date range limit validation (≤ 365 days)
    - Export validation functions with descriptive error messages
    - _Requirements: 7.1, 7.2, 7.4_
  
  - [ ]* 2.2 Write property tests for date validation
    - **Property 3: Date Range Validation**
    - **Property 4: Date Range Limit Validation**
    - **Property 5: ISO 8601 Date Validation**
    - **Validates: Requirements 7.1, 7.2, 7.4**
  
  - [x] 2.3 Create search topic validation utilities
    - Implement length validation (1-500 characters)
    - Export validation function with descriptive error messages
    - _Requirements: 7.5_
  
  - [ ]* 2.4 Write property tests for search topic validation
    - **Property 6: Search Topic Length Validation**
    - **Validates: Requirements 7.5**
  
  - [x] 2.5 Implement message normalization utilities
    - Create Gmail message transformer (extract subject, text, timestamp, sender, recipient)
    - Create Slack message transformer (empty subject, extract text, timestamp, sender, recipient)
    - Implement whitespace trimming and consecutive space normalization
    - Implement deduplication hash computation (SHA-256 of source:timestamp:sender:text)
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 9.1_
  
  - [ ]* 2.6 Write property tests for message normalization
    - **Property 14: Complete Message Normalization**
    - **Property 15: Whitespace Normalization**
    - **Property 16: Timestamp Preservation**
    - **Property 17: Empty Subject for Slack Messages**
    - **Property 18: Deduplication Hash Computation**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6, 9.1**
  
  - [x] 2.7 Create retry logic utilities with exponential backoff
    - Implement exponential backoff calculator (base 1s, max 32s, multiplier 2)
    - Create retry wrapper for API calls (max 5 retries for rate limits)
    - Create retry wrapper for transient errors (max 3 retries)
    - Add CloudWatch logging for retry attempts
    - _Requirements: 2.5, 3.5, 10.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Create Job Lambda function
  - [x] 4.1 Create request validation and parsing logic
    - Parse request body and extract startDate, endDate, searchTopic
    - Validate all input parameters using shared utilities
    - Extract userId from Cognito JWT claims
    - Return 400 Bad Request for validation failures
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ]* 4.2 Write property tests for request validation
    - **Property 3: Date Range Validation**
    - **Property 4: Date Range Limit Validation**
    - **Property 5: ISO 8601 Date Validation**
    - **Property 6: Search Topic Length Validation**
    - **Property 7: Validation Failure Prevents Job Creation**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
  
  - [x] 4.3 Implement concurrent job limit checking
    - Query Jobs table using UserIdStatusIndex GSI for user's PROCESSING jobs
    - Count concurrent PROCESSING jobs
    - Return 429 Too Many Requests if count ≥ 5
    - _Requirements: 8.3, 8.4_
  
  - [ ]* 4.4 Write property tests for concurrent job limits
    - **Property 8: Concurrent Job Limit Enforcement**
    - **Property 9: Multiple Concurrent Jobs Support**
    - **Validates: Requirements 8.3, 8.4, 8.1**
  
  - [x] 4.5 Create job record and invoke Process Job Lambda
    - Generate UUID v4 for jobId
    - Create job record with status "PROCESSING" and current timestamp
    - Store job record in Jobs table
    - Invoke Process Job Lambda asynchronously
    - Return 201 Created with job details within 500ms
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [ ]* 4.6 Write property tests for job creation
    - **Property 1: Job Record Completeness**
    - **Property 2: Unique Job Identifiers**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  
  - [ ]* 4.7 Write unit tests for Create Job Lambda
    - Test successful job creation with all fields
    - Test successful job creation with optional searchTopic
    - Test validation error responses
    - Test concurrent job limit enforcement
    - Test async Lambda invocation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1-7.5, 8.3_

- [x] 5. Implement OAuth token retrieval and decryption utilities
  - [x] 5.1 Create user token retrieval function
    - Query Users table by internalUserId
    - Extract gmailOAuthToken and slackOAuthToken
    - Return error if user not found or tokens missing
    - _Requirements: 2.1, 3.1_
  
  - [x] 5.2 Implement KMS token decryption
    - Decrypt Gmail access token and refresh token using KMS
    - Decrypt Slack access token and refresh token using KMS
    - Handle KMS decryption failures with descriptive errors
    - _Requirements: 2.1, 3.1_
  
  - [ ]* 5.3 Write property tests for OAuth token retrieval
    - **Property 10: OAuth Token Retrieval**
    - **Validates: Requirements 2.1, 3.1**
  
  - [ ]* 5.4 Write unit tests for token utilities
    - Test successful token retrieval and decryption
    - Test missing user error
    - Test missing tokens error
    - Test KMS decryption failure
    - _Requirements: 2.1, 3.1_

- [x] 6. Implement Gmail API integration
  - [x] 6.1 Create Gmail API client with authentication
    - Initialize Gmail API client with decrypted OAuth token
    - Implement token refresh logic for expired tokens
    - Handle authentication errors (401, 403)
    - _Requirements: 2.1, 2.4_
  
  - [x] 6.2 Implement Gmail message fetching with pagination
    - Build search query with date range (after:YYYY/MM/DD before:YYYY/MM/DD)
    - Add optional topic filter (subject:${searchTopic} OR body:${searchTopic})
    - Fetch messages with pagination (maxResults: 500)
    - Handle rate limits (429) with exponential backoff (max 5 retries)
    - Handle API errors (5xx) with retry logic (max 3 retries)
    - _Requirements: 2.2, 2.3, 2.5_
  
  - [ ]* 6.3 Write property tests for Gmail integration
    - **Property 11: Complete Message Retrieval**
    - **Property 12: Search Topic Filtering**
    - **Property 13: Exponential Backoff for Rate Limits**
    - **Validates: Requirements 2.2, 2.3, 2.5**
  
  - [ ]* 6.4 Write unit tests for Gmail API client
    - Test successful message retrieval
    - Test pagination handling
    - Test search topic filtering
    - Test rate limit retry with exponential backoff
    - Test OAuth token expiration handling
    - Test API error handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 7. Implement Slack API integration
  - [x] 7.1 Create Slack API client with authentication
    - Initialize Slack API client with decrypted OAuth token
    - Implement token refresh logic for expired tokens
    - Handle authentication errors (invalid_auth, not_authed)
    - _Requirements: 3.1, 3.4_
  
  - [x] 7.2 Implement Slack message fetching with pagination
    - Build search query with date range (after:YYYY-MM-DD before:YYYY-MM-DD)
    - Add optional topic filter (${searchTopic})
    - Fetch messages with pagination (count: 100)
    - Handle rate limits (rate_limited) with exponential backoff (max 5 retries)
    - Use Retry-After header when available
    - Handle network errors with retry logic (max 3 retries)
    - _Requirements: 3.2, 3.3, 3.5_
  
  - [ ]* 7.3 Write property tests for Slack integration
    - **Property 11: Complete Message Retrieval**
    - **Property 12: Search Topic Filtering**
    - **Property 13: Exponential Backoff for Rate Limits**
    - **Validates: Requirements 3.2, 3.3, 3.5**
  
  - [ ]* 7.4 Write unit tests for Slack API client
    - Test successful message retrieval
    - Test pagination handling
    - Test search topic filtering
    - Test rate limit retry with exponential backoff
    - Test OAuth token expiration handling
    - Test network error handling
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement message deduplication logic
  - [x] 9.1 Create deduplication checker using GSI
    - Query JobIdDeduplicationHashIndex GSI for existing hash
    - Return true if hash exists, false otherwise
    - _Requirements: 9.1, 9.2_
  
  - [x] 9.2 Implement batch message storage with deduplication
    - For each normalized message, compute deduplication hash
    - Check if hash exists in current job using GSI
    - Skip duplicate messages, store unique messages
    - Track count of deduplicated messages
    - Use DynamoDB BatchWriteItem for efficient storage
    - _Requirements: 9.1, 9.2, 9.4_
  
  - [ ]* 9.3 Write property tests for deduplication
    - **Property 18: Deduplication Hash Computation**
    - **Property 19: Within-Job Deduplication**
    - **Property 20: Cross-Job Message Allowance**
    - **Property 21: Timestamp Uniqueness in Deduplication**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
  
  - [ ]* 9.4 Write unit tests for deduplication logic
    - Test deduplication hash computation
    - Test duplicate detection within job
    - Test same message allowed across different jobs
    - Test messages with different timestamps treated as distinct
    - Test batch write with mixed duplicates and unique messages
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 10. Implement Process Job Lambda function
  - [x] 10.1 Create job processing orchestration
    - Retrieve job record from Jobs table
    - Retrieve and decrypt user OAuth tokens
    - Fetch messages from Gmail API
    - Fetch messages from Slack API
    - Normalize all messages using shared utilities
    - Deduplicate and store messages in Messages table
    - Update job status to "DONE" with messageCount and completedAt
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 4.1, 4.3, 5.1, 9.2_
  
  - [x] 10.2 Implement comprehensive error handling
    - Catch OAuth token errors → status "FAILED", descriptive errorMessage
    - Catch API errors → retry with backoff, then status "FAILED"
    - Catch transient errors → retry up to 3 times, then status "FAILED"
    - Update job with completedAt timestamp on failure
    - Log all errors to CloudWatch with structured format
    - _Requirements: 2.4, 3.4, 5.2, 5.3, 5.4, 10.1, 10.3_
  
  - [x] 10.3 Add CloudWatch metrics emission
    - Emit JobCompleted metric on success
    - Emit JobFailed metric on failure
    - Emit MessagesFetched metric with count
    - Emit MessagesDeduplicated metric with count
    - Emit APIRetries metric for each retry attempt
    - Emit ProcessingDuration metric with elapsed time
    - Include dimensions: UserId, Source (gmail/slack), ErrorType
    - _Requirements: 10.4_
  
  - [ ]* 10.4 Write property tests for job processing
    - **Property 10: OAuth Token Retrieval**
    - **Property 11: Complete Message Retrieval**
    - **Property 14: Complete Message Normalization**
    - **Property 22: Job Status Transitions with Timestamps**
    - **Property 23: Error Message Storage for Failed Jobs**
    - **Property 24: Transient Error Retry Logic**
    - **Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 5.1, 5.2, 5.3, 5.4, 10.3**
  
  - [ ]* 10.5 Write unit tests for Process Job Lambda
    - Test successful end-to-end processing
    - Test OAuth token retrieval and decryption
    - Test message fetching from both APIs
    - Test message normalization
    - Test deduplication and storage
    - Test job status update to DONE with messageCount
    - Test error handling for expired tokens
    - Test error handling for API failures
    - Test retry logic for transient errors
    - Test CloudWatch metrics emission
    - _Requirements: 2.1-2.5, 3.1-3.5, 4.1-4.6, 5.1-5.4, 9.1-9.5, 10.1-10.4_

- [x] 11. Implement Get Status Lambda function
  - [x] 11.1 Create status retrieval logic
    - Extract jobId from path parameters
    - Extract userId from Cognito JWT claims
    - Query Jobs table for job record
    - Return 404 if job not found
    - _Requirements: 6.1, 6.2_
  
  - [x] 11.2 Implement ownership verification
    - Compare requesting userId with job's userId
    - Return 403 Forbidden if userId doesn't match
    - _Requirements: 6.4_
  
  - [x] 11.3 Format status response with conditional fields
    - Include all required fields (jobId, userId, status, startDate, endDate, createdAt)
    - Include completedAt if present
    - Include messageCount if status is "DONE"
    - Include errorMessage if status is "FAILED"
    - Return 200 OK within 200ms
    - _Requirements: 6.2, 6.5_
  
  - [ ]* 11.4 Write property tests for status retrieval
    - **Property 25: Status Response Completeness**
    - **Property 26: Job Ownership Verification**
    - **Property 27: Message Count for Completed Jobs**
    - **Validates: Requirements 6.2, 6.4, 6.5**
  
  - [ ]* 11.5 Write unit tests for Get Status Lambda
    - Test successful status retrieval for PROCESSING job
    - Test successful status retrieval for DONE job with messageCount
    - Test successful status retrieval for FAILED job with errorMessage
    - Test 404 error for non-existent job
    - Test 403 error for ownership mismatch
    - Test response time under 200ms
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Integrate data pull functionality with existing DateRangeSelector
  - [x] 13.1 Convert date range dropdown values to API date format
    - Map "last-7-days" to startDate/endDate (today - 7 days to today)
    - Map "last-month" to startDate/endDate (today - 30 days to today)
    - Map "last-quarter" to startDate/endDate (today - 90 days to today)
    - Map "last-year" to startDate/endDate (today - 365 days to today)
    - Format dates as ISO 8601 strings
    - _Requirements: 7.1, 7.4_
  
  - [x] 13.2 Add validation to DateRangeSelector component
    - Validate search topic length (1-500 chars if provided)
    - Display inline validation errors below search input
    - Disable "Pull Data" button when validation fails
    - Show loading state on button during API call
    - _Requirements: 7.5_
  
  - [x] 13.3 Implement API integration in handlePullData
    - Create API client function for POST /api/jobs
    - Include Cognito JWT token in Authorization header
    - Send startDate, endDate, and optional searchTopic
    - Handle 400 validation errors and display to user
    - Handle 429 concurrent limit errors and display to user
    - Handle 401 unauthorized errors and redirect to login
    - On success (201), show success message with jobId
    - _Requirements: 1.5, 7.3, 8.4_
  
  - [ ]* 13.4 Write unit tests for DateRangeSelector integration
    - Test date range conversion for each dropdown option
    - Test search topic validation
    - Test successful API call
    - Test error handling for validation failures
    - Test error handling for concurrent limit
    - Test loading states
    - _Requirements: 1.5, 7.1, 7.2, 7.4, 7.5, 8.4_

- [x] 14. Implement job status tracking and display
  - [x] 14.1 Create job status state management
    - Add state to track active job (jobId, status, details)
    - Store job information after successful creation
    - Display job status indicator in DateRangeSelector or nearby
    - Show visual indicator for PROCESSING, DONE, FAILED states
    - Display message count when status is DONE
    - Display error message when status is FAILED
    - _Requirements: 6.2, 6.5, 5.4_
  
  - [x] 14.2 Implement automatic status polling
    - Create API client function for GET /api/jobs/:jobId
    - Include Cognito JWT token in Authorization header
    - Poll every 2 seconds while status is PROCESSING
    - Update UI with latest status on each poll
    - Stop polling when status changes to DONE or FAILED
    - Handle 404 errors (job not found)
    - Handle 403 errors (ownership mismatch)
    - Handle 401 errors (redirect to login)
    - _Requirements: 6.1, 6.6, 6.7, 6.8_
  
  - [x] 14.3 Add job status notification/toast
    - Show toast notification when job completes (DONE)
    - Show error toast when job fails (FAILED)
    - Include message count in success notification
    - Include error details in failure notification
    - Allow user to dismiss notifications
    - _Requirements: 5.1, 5.4_
  
  - [ ]* 14.4 Write unit tests for status tracking
    - Test status display for PROCESSING job
    - Test status display for DONE job with message count
    - Test status display for FAILED job with error message
    - Test automatic polling behavior
    - Test polling stops on DONE status
    - Test polling stops on FAILED status
    - Test error handling for 404, 403, 401
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 15. Wire frontend and backend together
  - [x] 15.1 Configure API Gateway endpoint in frontend
    - Add API Gateway URL to frontend environment configuration
    - Configure CORS settings in backend CDK stack
    - Test end-to-end flow from frontend to backend
    - _Requirements: 1.5, 6.1_
  
  - [x] 15.2 Update CDK stack with all resources
    - Ensure all Lambda functions have correct IAM permissions
    - Ensure API Gateway has Cognito authorizer configured
    - Ensure CloudWatch log groups are created
    - Ensure KMS key permissions are granted to Process Job Lambda
    - Deploy stack and verify all resources created
    - _Requirements: 2.1, 3.1, 10.2, 10.4_
  
  - [ ]* 15.3 Write integration tests for end-to-end flow
    - Test complete flow: create job → process → poll status → verify DONE
    - Test error flow: invalid OAuth token → job FAILED
    - Test concurrent job limit enforcement
    - Test deduplication across multiple jobs
    - Test API rate limit handling
    - _Requirements: 1.1-1.5, 2.1-2.5, 3.1-3.5, 4.1-4.6, 5.1-5.4, 6.1-6.8, 8.1-8.5, 9.1-9.5_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples, edge cases, and integration points
- All Lambda functions use Node.js 22.x runtime
- All code uses TypeScript for type safety
- Fast-check library is used for property-based testing with minimum 100 iterations per test
- CloudWatch metrics and logging are integrated throughout for observability

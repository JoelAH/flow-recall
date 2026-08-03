# Implementation Plan: Bedrock Message Analysis

## Overview

This implementation plan breaks down the Bedrock Message Analysis feature into discrete coding tasks. The feature consists of two Lambda functions (Message_Analyzer and Timeline_Generator) that use Amazon Bedrock to extract insights and construct timelines from stored messages. Results are persisted in a DynamoDB Analysis table with comprehensive error handling and monitoring.

The implementation follows an incremental approach: infrastructure first, then core Bedrock client, followed by Lambda functions, and finally testing and integration.

## Tasks

- [x] 1. Set up CDK infrastructure and DynamoDB tables
  - [x] 1.1 Create Analysis DynamoDB table with GSIs
    - Define table schema with analysisId partition key
    - Add JobIdCreatedAtIndex GSI (PK: jobId, SK: createdAt)
    - Add UserIdCreatedAtIndex GSI (PK: userId, SK: createdAt)
    - Configure PAY_PER_REQUEST billing, point-in-time recovery, AWS_MANAGED encryption
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 1.2 Create IAM role for Lambda functions with Bedrock permissions
    - Create execution role with basic Lambda permissions
    - Add bedrock:InvokeModel and bedrock:InvokeModelWithResponseStream permissions
    - Add DynamoDB read permissions for Messages table
    - Add DynamoDB write permissions for Analysis table
    - Add CloudWatch Logs and Metrics permissions
    - _Requirements: 3.1_

  - [x] 1.3 Create EventBridge rule for triggering analysis
    - Define event pattern matching "Job Completed" events from data-ingestion
    - Configure rule to trigger both Message_Analyzer and Timeline_Generator
    - Add Lambda invoke permissions for EventBridge
    - _Requirements: 5.1_

- [x] 2. Implement Bedrock client abstraction
  - [x] 2.1 Create BedrockClient class with configuration
    - Define BedrockClientConfig, BedrockInvokeParams, BedrockResponse, BedrockError interfaces
    - Implement constructor accepting modelId, region, maxTokens, temperature
    - Initialize AWS SDK v3 BedrockRuntimeClient with IAM authentication
    - Add environment variable support for model ID configuration
    - _Requirements: 3.1, 3.2_

  - [x] 2.2 Implement invoke method with error handling
    - Implement invoke<T> method accepting prompt and optional systemPrompt
    - Construct Bedrock API request with model parameters
    - Handle authentication errors (return AUTH error type)
    - Handle rate limit errors (return RATE_LIMIT error type)
    - Handle timeout errors (return TIMEOUT error type)
    - Handle network and system errors (return SYSTEM error type)
    - _Requirements: 3.2, 3.3, 3.5, 7.1, 7.2_

  - [x] 2.3 Implement JSON response parsing and validation
    - Parse Bedrock response body to extract completion text
    - Attempt JSON.parse on completion text
    - Return INVALID_RESPONSE error if JSON parsing fails
    - Return success response with parsed data if valid
    - Add structured logging for all invocations with request/response metadata
    - _Requirements: 3.4, 3.6, 7.4_

  - [ ]* 2.4 Write unit tests for BedrockClient
    - Test successful invocation with mocked Bedrock API
    - Test authentication failure (401 response)
    - Test rate limit error (429 response)
    - Test timeout scenario
    - Test invalid JSON response
    - Test network error handling

  - [ ]* 2.5 Write property tests for BedrockClient
    - **Property 8: Bedrock Response Parsing**
    - **Validates: Requirements 3.4**
    - **Property 9: Bedrock Error Handling**
    - **Validates: Requirements 3.5**
    - **Property 10: Invalid JSON Error Handling**
    - **Validates: Requirements 3.6, 7.4**
    - **Property 17: Rate Limit Error Handling**
    - **Validates: Requirements 7.1**
    - **Property 18: Timeout Error Handling**
    - **Validates: Requirements 7.2**

- [x] 3. Implement prompt engineering templates
  - [x] 3.1 Create insight extraction prompt template
    - Define system prompt for insight extraction (exclude casual content, greetings, signatures)
    - Define user prompt template with JSON schema for decisions, risks, tasks, deadlines
    - Add priority classification guidance (high: urgent/blocking, medium: important, low: nice-to-have)
    - Add severity classification guidance for risks (critical, high, medium, low)
    - Create function to format messages with metadata for prompt
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 3.2 Create timeline generation prompt template
    - Define system prompt for timeline generation (exclude casual content, greetings, signatures)
    - Define user prompt template with JSON schema for timeline entries
    - Create function to format chronologically sorted messages for prompt
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.3 Write unit tests for prompt construction
    - Test prompt construction with various message formats
    - Test system prompt inclusion
    - Test message metadata formatting
    - Test chronological sorting for timeline prompts

- [x] 4. Implement message retrieval from DynamoDB
  - [x] 4.1 Create message retrieval function
    - Implement function to query Messages table by jobId
    - Use JobIdTimestampIndex GSI for chronological ordering
    - Map DynamoDB items to MessageRecord interface
    - Return empty array if no messages found (not an error)
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 Add error handling for message retrieval
    - Catch DynamoDB query errors
    - Log error with jobId context
    - Emit CloudWatch metric MessageRetrievalFailed
    - Throw descriptive error with retrieval failure message
    - _Requirements: 5.3, 7.3_

  - [ ]* 4.3 Write unit tests for message retrieval
    - Test successful retrieval with mocked DynamoDB
    - Test empty result handling
    - Test DynamoDB error handling
    - Test message field completeness

  - [ ]* 4.4 Write property tests for message retrieval
    - **Property 11: Message Retrieval Field Completeness**
    - **Validates: Requirements 5.2**
    - **Property 12: Message Retrieval Error Handling**
    - **Validates: Requirements 5.3, 7.3**

- [x] 5. Implement Message_Analyzer Lambda function
  - [x] 5.1 Create Lambda handler for insight extraction
    - Define JobCompletedEvent interface
    - Implement handler function accepting JobCompletedEvent
    - Parse event to extract jobId, userId, messageCount, completedAt
    - Add structured logging for invocation start
    - _Requirements: 1.1_

  - [x] 5.2 Implement insight extraction workflow
    - Retrieve messages from Messages table using jobId
    - Handle empty message set (return empty analysis result)
    - Construct insight extraction prompt with messages
    - Invoke BedrockClient with prompt
    - Parse response into InsightExtractionResponse
    - _Requirements: 1.1, 1.6, 5.1, 5.2, 5.4_

  - [x] 5.3 Implement analysis result storage
    - Generate unique analysisId using UUID
    - Create AnalysisRecord with analysisType='insights'
    - Include createdAt timestamp in ISO 8601 format
    - Include messageIds array with all analyzed message IDs
    - Store record in Analysis table
    - _Requirements: 6.1, 6.7, 6.8, 6.9_

  - [x] 5.4 Add comprehensive error handling
    - Handle message retrieval failures (log, emit metric, throw)
    - Handle Bedrock invocation failures (log, emit metric, throw)
    - Handle JSON parsing failures (log, emit metric, throw)
    - Handle DynamoDB storage failures (log, emit metric, throw)
    - Ensure all errors include type and descriptive message
    - _Requirements: 7.3, 7.4, 7.5_

  - [x] 5.5 Add CloudWatch metrics emission
    - Emit BedrockInvocationFailed metric with UserId and ErrorType dimensions
    - Emit MessageRetrievalFailed metric with UserId and ErrorType dimensions
    - Emit AnalysisStorageFailed metric with UserId and ErrorType dimensions
    - Emit JSONParsingFailed metric with UserId dimension
    - Emit AnalysisCompleted metric for successful executions
    - _Requirements: 7.3, 7.4_

  - [ ]* 5.6 Write unit tests for Message_Analyzer
    - Test with empty message set (should return empty arrays)
    - Test with single message containing one decision
    - Test with multiple messages containing mixed insights
    - Test DynamoDB storage integration with mocked AWS SDK
    - Test EventBridge event parsing
    - Test CloudWatch metrics emission

  - [ ]* 5.7 Write property tests for Message_Analyzer
    - **Property 1: Analysis Result Structure Completeness**
    - **Validates: Requirements 1.1, 4.1, 4.2, 4.3, 4.4**
    - **Property 2: Task Priority Validity**
    - **Validates: Requirements 1.2, 4.6**
    - **Property 3: Analysis Result JSON Round-Trip**
    - **Validates: Requirements 1.7**
    - **Property 7: Valid JSON Output**
    - **Validates: Requirements 1.6, 2.6, 4.8**
    - **Property 13: Analysis Record Unique Identifier**
    - **Validates: Requirements 6.7**
    - **Property 14: Analysis Record Timestamp Presence**
    - **Validates: Requirements 6.8**
    - **Property 15: Analysis Record Message ID References**
    - **Validates: Requirements 6.9**
    - **Property 16: DynamoDB Storage Error Handling**
    - **Validates: Requirements 6.10**
    - **Property 19: Error Response Structure**
    - **Validates: Requirements 7.5**

- [x] 6. Implement Timeline_Generator Lambda function
  - [x] 6.1 Create Lambda handler for timeline generation
    - Define JobCompletedEvent interface (same as Message_Analyzer)
    - Implement handler function accepting JobCompletedEvent
    - Parse event to extract jobId, userId, messageCount, completedAt
    - Add structured logging for invocation start
    - _Requirements: 2.1_

  - [x] 6.2 Implement timeline generation workflow
    - Retrieve messages from Messages table using jobId
    - Sort messages chronologically by timestamp
    - Handle empty message set (return empty timeline)
    - Construct timeline generation prompt with sorted messages
    - Invoke BedrockClient with prompt
    - Parse response into TimelineGenerationResponse
    - _Requirements: 2.1, 2.6, 5.1, 5.2, 5.4_

  - [x] 6.3 Implement timeline result storage
    - Generate unique analysisId using UUID
    - Create AnalysisRecord with analysisType='timeline'
    - Include createdAt timestamp in ISO 8601 format
    - Include messageIds array with all analyzed message IDs
    - Store record in Analysis table
    - _Requirements: 6.1, 6.7, 6.8, 6.9_

  - [x] 6.4 Add comprehensive error handling
    - Handle message retrieval failures (log and throw)
    - Handle Bedrock invocation failures (log and throw)
    - Handle JSON parsing failures (log and throw)
    - Handle DynamoDB storage failures (log and throw)
    - Ensure all errors include type and descriptive message
    - _Requirements: 7.3, 7.4, 7.5_

  - [x] 6.5 Add CloudWatch metrics emission
    - ~~Emit BedrockInvocationFailed metric with UserId and ErrorType dimensions~~
    - ~~Emit MessageRetrievalFailed metric with UserId and ErrorType dimensions~~
    - ~~Emit AnalysisStorageFailed metric with UserId and ErrorType dimensions~~
    - ~~Emit JSONParsingFailed metric with UserId dimension~~
    - ~~Emit TimelineCompleted metric for successful executions~~
    - _Requirements: 7.3, 7.4_
    - **NOTE: CloudWatch metrics removed per user request**

  - [ ]* 6.6 Write unit tests for Timeline_Generator
    - Test with empty message set (should return empty timeline)
    - Test with single message
    - Test with messages in chronological order
    - Test with messages in reverse chronological order (should sort correctly)
    - Test DynamoDB storage integration

  - [ ]* 6.7 Write property tests for Timeline_Generator
    - **Property 4: Timeline Result Structure Completeness**
    - **Validates: Requirements 2.1, 4.5**
    - **Property 5: Timeline Entry Timestamp Presence**
    - **Validates: Requirements 4.7**
    - **Property 6: Timeline Result JSON Round-Trip**
    - **Validates: Requirements 2.7**
    - **Property 7: Valid JSON Output**
    - **Validates: Requirements 1.6, 2.6, 4.8**
    - **Property 13: Analysis Record Unique Identifier**
    - **Validates: Requirements 6.7**
    - **Property 14: Analysis Record Timestamp Presence**
    - **Validates: Requirements 6.8**
    - **Property 15: Analysis Record Message ID References**
    - **Validates: Requirements 6.9**
    - **Property 16: DynamoDB Storage Error Handling**
    - **Validates: Requirements 6.10**
    - **Property 19: Error Response Structure**
    - **Validates: Requirements 7.5**

- [x] 7. Create CDK Lambda constructs and wire components
  - [x] 7.1 Create Message_Analyzer Lambda construct
    - Define Lambda function with Node.js 22.x runtime
    - Set handler to message-analyzer/index.handler
    - Attach IAM execution role with Bedrock and DynamoDB permissions
    - Configure environment variables (MODEL_ID, MESSAGES_TABLE_NAME, ANALYSIS_TABLE_NAME)
    - Set timeout to 5 minutes (Bedrock can be slow)
    - Set memory to 512 MB
    - _Requirements: 1.1, 3.1, 3.2_

  - [x] 7.2 Create Timeline_Generator Lambda construct
    - Define Lambda function with Node.js 22.x runtime
    - Set handler to timeline-generator/index.handler
    - Attach IAM execution role with Bedrock and DynamoDB permissions
    - Configure environment variables (MODEL_ID, MESSAGES_TABLE_NAME, ANALYSIS_TABLE_NAME)
    - Set timeout to 5 minutes
    - Set memory to 512 MB
    - _Requirements: 2.1, 3.1, 3.2_

  - [x] 7.3 Wire EventBridge rule to Lambda functions
    - Add Message_Analyzer as target for EventBridge rule
    - Add Timeline_Generator as target for EventBridge rule
    - Configure dead-letter queue for failed invocations
    - Configure retry policy (2 retries with exponential backoff)
    - _Requirements: 5.1_

  - [x] 7.4 Add CloudWatch dashboard and alarms
    - Create dashboard with Lambda invocation metrics
    - Create dashboard with Bedrock invocation metrics
    - Create dashboard with error rate metrics
    - Create alarm for BedrockInvocationFailed with ErrorType=RATE_LIMIT
    - Create alarm for BedrockInvocationFailed with ErrorType=AUTH
    - Create alarm for error rate exceeding 10% of total invocations
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 9. Create integration tests and deployment validation
  - [ ]* 9.1 Write integration tests for Message_Analyzer
    - Test end-to-end flow with real DynamoDB tables (LocalStack or test account)
    - Test EventBridge trigger integration
    - Test IAM permissions for Bedrock access
    - Test CloudWatch metrics and logs emission
    - Verify Analysis table records are created correctly

  - [ ]* 9.2 Write integration tests for Timeline_Generator
    - Test end-to-end flow with real DynamoDB tables
    - Test EventBridge trigger integration
    - Test IAM permissions for Bedrock access
    - Test CloudWatch metrics and logs emission
    - Verify Analysis table records are created correctly

  - [ ]* 9.3 Write integration tests for Bedrock client
    - Test with real Bedrock API using Claude 3 Haiku (cost-effective)
    - Verify prompt quality and response parsing
    - Test rate limit handling with rapid invocations
    - Test timeout handling with large message sets

  - [x] 9.4 Create deployment script and validation
    - Create npm script for CDK deployment (npm run deploy:analysis)
    - Add pre-deployment validation (check Node.js 22.x, AWS credentials)
    - Add post-deployment smoke tests (verify tables exist, Lambda functions deployed)
    - Document manual Bedrock model access configuration steps
    - _Requirements: 3.1_

- [x] 10. Create documentation and configuration guide
  - [x] 10.1 Document Bedrock model access setup
    - Document AWS Console steps for requesting model access
    - List supported model IDs (Claude 3 Haiku, Claude 3 Sonnet, Titan)
    - Document model selection trade-offs (cost vs quality vs speed)
    - Document region availability considerations
    - _Requirements: 3.1, 3.2_

  - [x] 10.2 Document IAM permissions and security
    - Document required IAM permissions for Lambda execution role
    - Document least-privilege principle for Bedrock access
    - Document encryption settings for DynamoDB tables
    - Document CloudWatch Logs retention policies

  - [x] 10.3 Document cost management and monitoring
    - Document Bedrock pricing model (per-token charges)
    - Document CloudWatch metrics for usage monitoring
    - Document billing alert setup for unexpected usage spikes
    - Document token limit recommendations per invocation

  - [x] 10.4 Create operational runbook
    - Document common error scenarios and resolutions
    - Document CloudWatch Logs Insights queries for debugging
    - Document how to manually trigger analysis for testing
    - Document how to query Analysis table for results

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (19 total)
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end behavior with real AWS services
- Node.js 22.x is required for all Lambda functions (per tech stack requirements)
- Bedrock model access must be manually configured in AWS Console before deployment
- Claude 3 Haiku is recommended for initial implementation (cost-effective, fast)

# Requirements Document

## Introduction

The Data Ingestion Pipeline enables users to retrieve workplace communications (email and Slack messages) within a specified timeframe and optional search criteria. The system fetches, normalizes, trims, and stores messages in DynamoDB while tracking job status for asynchronous processing. This feature provides the foundation for FlowRecall's timeline reconstruction and catch-up brief generation.

## Glossary

- **Ingestion_Service**: The system component responsible for fetching, processing, and storing workplace communications
- **Job**: A user-initiated data retrieval request with associated metadata and processing status
- **Message**: A normalized communication record from email or Slack
- **User**: An authenticated FlowRecall user with OAuth tokens for Gmail and Slack
- **Date_Range**: A start date and end date pair defining the temporal scope of data retrieval
- **Search_Topic**: Optional text used to filter messages by content relevance
- **Jobs_Table**: DynamoDB table storing job metadata and status
- **Messages_Table**: DynamoDB table storing normalized message records
- **OAuth_Token**: Valid authentication credential for Gmail or Slack API access

## Requirements

### Requirement 1: Job Creation

**User Story:** As a user, I want to initiate a data pull request, so that the system can begin fetching my workplace communications.

#### Acceptance Criteria

1. WHEN a user submits a data pull request with a Date_Range, THE Ingestion_Service SHALL create a Job record in the Jobs_Table with status "PROCESSING"
2. THE Ingestion_Service SHALL generate a unique jobId for each Job
3. THE Ingestion_Service SHALL store the userId, startDate, endDate, and createdAt timestamp in the Job record
4. WHERE a Search_Topic is provided, THE Ingestion_Service SHALL store the Search_Topic in the Job record
5. THE Ingestion_Service SHALL return the jobId to the user within 500ms of request submission

### Requirement 2: Email Data Retrieval

**User Story:** As a user, I want the system to fetch my emails within the specified timeframe, so that I can review relevant communications.

#### Acceptance Criteria

1. WHEN a Job is created, THE Ingestion_Service SHALL retrieve the user's OAuth_Token for Gmail
2. THE Ingestion_Service SHALL fetch all emails within the specified Date_Range using the Gmail API
3. WHERE a Search_Topic is provided, THE Ingestion_Service SHALL filter emails containing the Search_Topic text
4. IF the OAuth_Token is invalid or expired, THEN THE Ingestion_Service SHALL update the Job status to "FAILED" and record the error
5. THE Ingestion_Service SHALL handle Gmail API rate limits by implementing exponential backoff with a maximum of 5 retry attempts

### Requirement 3: Slack Data Retrieval

**User Story:** As a user, I want the system to fetch my Slack messages within the specified timeframe, so that I can review relevant communications.

#### Acceptance Criteria

1. WHEN a Job is created, THE Ingestion_Service SHALL retrieve the user's OAuth_Token for Slack
2. THE Ingestion_Service SHALL fetch all Slack messages within the specified Date_Range using the Slack API
3. WHERE a Search_Topic is provided, THE Ingestion_Service SHALL filter Slack messages containing the Search_Topic text
4. IF the OAuth_Token is invalid or expired, THEN THE Ingestion_Service SHALL update the Job status to "FAILED" and record the error
5. THE Ingestion_Service SHALL handle Slack API rate limits by implementing exponential backoff with a maximum of 5 retry attempts

### Requirement 4: Message Normalization and Storage

**User Story:** As a developer, I want messages from different sources stored in a consistent format, so that downstream processing can handle them uniformly.

#### Acceptance Criteria

1. FOR ALL retrieved messages, THE Ingestion_Service SHALL normalize them into a standard schema containing source, subject, text, timestamp, createdAt, sender, and recipient fields
2. THE Ingestion_Service SHALL trim whitespace from message text and remove consecutive spaces exceeding one space
3. THE Ingestion_Service SHALL store each normalized Message in the Messages_Table with the associated jobId
4. THE Ingestion_Service SHALL preserve the original timestamp from the source system
5. WHERE a message lacks a subject field, THE Ingestion_Service SHALL store an empty string for the subject
6. THE Ingestion_Service SHALL extract sender and recipient information from the source message metadata

### Requirement 5: Job Status Management

**User Story:** As a user, I want to know when my data pull is complete, so that I can proceed with reviewing the results.

#### Acceptance Criteria

1. WHEN all messages have been successfully stored, THE Ingestion_Service SHALL update the Job status to "DONE"
2. IF any error occurs during processing, THEN THE Ingestion_Service SHALL update the Job status to "FAILED"
3. THE Ingestion_Service SHALL record the completion timestamp when updating status to "DONE" or "FAILED"
4. WHERE a Job status is "FAILED", THE Ingestion_Service SHALL store an error message describing the failure reason
5. THE Ingestion_Service SHALL process each Job atomically to prevent partial completion states

### Requirement 6: Automatic Job Status Polling

**User Story:** As a user, I want to see my data pull status automatically update in the UI, so that I know when processing is complete without manual checking.

#### Acceptance Criteria

1. WHEN the UI requests Job status using a jobId, THE Ingestion_Service SHALL return the current status within 200ms
2. THE Ingestion_Service SHALL return the Job record including status, startDate, endDate, and createdAt fields
3. IF the jobId does not exist, THEN THE Ingestion_Service SHALL return an error indicating the Job was not found
4. THE Ingestion_Service SHALL verify the requesting user owns the Job before returning status information
5. WHERE the Job status is "DONE", THE Ingestion_Service SHALL include the count of messages retrieved
6. THE UI SHALL automatically poll for Job status every 2 seconds while the Job status is "PROCESSING"
7. THE UI SHALL display the current Job status (PROCESSING, DONE, FAILED) without requiring user interaction
8. WHEN the Job status changes to "DONE" or "FAILED", THE UI SHALL stop polling for that Job

### Requirement 7: Data Validation

**User Story:** As a user, I want the system to validate my input parameters, so that I receive clear feedback on invalid requests.

#### Acceptance Criteria

1. WHEN a user submits a data pull request, THE Ingestion_Service SHALL validate that startDate is before or equal to endDate
2. THE Ingestion_Service SHALL validate that the Date_Range does not exceed 365 days
3. IF validation fails, THEN THE Ingestion_Service SHALL return a descriptive error message within 200ms without creating a Job
4. THE Ingestion_Service SHALL validate that startDate and endDate are valid ISO 8601 formatted dates
5. WHERE a Search_Topic is provided, THE Ingestion_Service SHALL validate it contains between 1 and 500 characters

### Requirement 8: Concurrent Job Handling

**User Story:** As a user, I want to initiate multiple data pull requests, so that I can retrieve different timeframes or topics simultaneously.

#### Acceptance Criteria

1. THE Ingestion_Service SHALL support multiple concurrent Jobs for the same user
2. THE Ingestion_Service SHALL process each Job independently without interference
3. THE Ingestion_Service SHALL limit each user to a maximum of 5 concurrent "PROCESSING" Jobs
4. IF a user attempts to create a Job exceeding the concurrent limit, THEN THE Ingestion_Service SHALL return an error indicating the limit has been reached
5. WHEN a Job completes, THE Ingestion_Service SHALL decrement the user's concurrent Job count

### Requirement 9: Message Deduplication

**User Story:** As a user, I want duplicate messages filtered out, so that I don't see the same communication multiple times.

#### Acceptance Criteria

1. FOR ALL messages retrieved, THE Ingestion_Service SHALL compute a unique identifier based on source, timestamp, sender, and text content
2. WHEN a duplicate message is detected within the same Job, THE Ingestion_Service SHALL store only the first occurrence
3. THE Ingestion_Service SHALL allow the same message to appear in different Jobs
4. THE Ingestion_Service SHALL log the count of deduplicated messages for each Job
5. WHERE messages have identical content but different timestamps, THE Ingestion_Service SHALL treat them as distinct messages

### Requirement 10: Error Recovery and Logging

**User Story:** As a developer, I want comprehensive error logging, so that I can diagnose and resolve processing failures.

#### Acceptance Criteria

1. WHEN any error occurs during processing, THE Ingestion_Service SHALL log the error with jobId, userId, timestamp, and error details
2. THE Ingestion_Service SHALL log the start and completion of each Job processing phase
3. IF a transient error occurs, THEN THE Ingestion_Service SHALL retry the operation up to 3 times before marking the Job as "FAILED"
4. THE Ingestion_Service SHALL emit CloudWatch metrics for Job success rate, processing duration, and message counts
5. WHERE API rate limits are encountered, THE Ingestion_Service SHALL log the rate limit event and retry timing

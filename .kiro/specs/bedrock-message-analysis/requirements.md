# Requirements Document

## Introduction

This feature implements the second segment of the FlowRecall message processing pipeline. After messages are stored in the system, Amazon Bedrock analyzes them to extract actionable insights (decisions, risks, tasks, deadlines) and constructs a chronological timeline of events. The analysis filters out noise (casual chatter, greetings) and focuses on meaningful project-related information, returning structured JSON output for downstream processing.

## Glossary

- **Message_Analyzer**: The Lambda function that invokes Bedrock to analyze stored messages
- **Timeline_Generator**: The Lambda function that constructs chronological event timelines from messages
- **Bedrock_Client**: The AWS SDK client for Amazon Bedrock API interactions
- **Insight**: A decision, risk/blocker, task, or deadline extracted from messages
- **Timeline_Entry**: A concise, timestamped event in the chronological timeline
- **Message_Store**: The DynamoDB table or S3 bucket containing stored messages from the first segment
- **Analysis_Result**: The structured JSON output containing insights and timeline entries
- **Casual_Content**: Greetings, signatures, small talk, and other non-project-related message content
- **Task_Priority**: Classification of tasks as high, medium, or low priority
- **Analysis_Table**: The DynamoDB table that stores structured analysis results
- **Analysis_Record**: A DynamoDB item containing the complete analysis output for a set of messages

## Requirements

### Requirement 1: Extract Actionable Insights from Messages

**User Story:** As a user returning from time away, I want the system to identify key decisions, risks, tasks, and deadlines from my messages, so that I can quickly understand what matters without reading everything.

#### Acceptance Criteria

1. WHEN the Message_Analyzer receives stored messages, THE Message_Analyzer SHALL invoke Bedrock to extract decisions, risks/blockers, tasks, and deadlines
2. WHEN extracting tasks, THE Message_Analyzer SHALL classify each task with a priority of high, medium, or low
3. THE Message_Analyzer SHALL exclude casual chatter from analysis results
4. THE Message_Analyzer SHALL exclude greetings and signatures from analysis results
5. THE Message_Analyzer SHALL extract only explicit project-related information without inferring implied meaning
6. WHEN analysis is complete, THE Message_Analyzer SHALL return insights in valid JSON format
7. FOR ALL analysis results, parsing the JSON output then serializing it back to JSON SHALL produce equivalent structured data (round-trip property)

### Requirement 2: Generate Chronological Timeline

**User Story:** As a user catching up on project activity, I want a chronological timeline of events, so that I can understand the sequence of what happened while I was away.

#### Acceptance Criteria

1. WHEN the Timeline_Generator receives stored messages, THE Timeline_Generator SHALL invoke Bedrock to construct a chronological timeline of events
2. THE Timeline_Generator SHALL create concise timeline entries
3. THE Timeline_Generator SHALL exclude casual chatter from timeline entries
4. THE Timeline_Generator SHALL exclude greetings and signatures from timeline entries
5. THE Timeline_Generator SHALL include only explicit project-related events without inferring implied meaning
6. WHEN timeline generation is complete, THE Timeline_Generator SHALL return timeline entries in valid JSON format
7. FOR ALL timeline results, parsing the JSON output then serializing it back to JSON SHALL produce equivalent structured data (round-trip property)

### Requirement 3: Bedrock Client Integration

**User Story:** As a developer, I want a reliable Bedrock client integration, so that the system can invoke AI models for message analysis.

#### Acceptance Criteria

1. THE Bedrock_Client SHALL authenticate with AWS Bedrock using IAM credentials
2. WHEN invoking Bedrock, THE Bedrock_Client SHALL specify the model to use for analysis
3. WHEN invoking Bedrock, THE Bedrock_Client SHALL provide the analysis prompt and message content
4. WHEN Bedrock returns a response, THE Bedrock_Client SHALL parse the response into structured data
5. IF Bedrock invocation fails, THEN THE Bedrock_Client SHALL return a descriptive error with the failure reason
6. IF Bedrock returns invalid JSON, THEN THE Bedrock_Client SHALL return a parsing error

### Requirement 4: Structured JSON Output Format

**User Story:** As a downstream system component, I want analysis results in a predictable JSON format, so that I can reliably process the insights and timeline data.

#### Acceptance Criteria

1. THE Analysis_Result SHALL contain a "decisions" array with decision objects
2. THE Analysis_Result SHALL contain a "risks" array with risk/blocker objects
3. THE Analysis_Result SHALL contain a "tasks" array with task objects including priority field
4. THE Analysis_Result SHALL contain a "deadlines" array with deadline objects
5. THE Analysis_Result SHALL contain a "timeline" array with timeline entry objects
6. WHEN a task is included, THE Analysis_Result SHALL specify the task priority as "high", "medium", or "low"
7. WHEN a timeline entry is included, THE Analysis_Result SHALL include a timestamp for the entry
8. THE Analysis_Result SHALL be valid JSON that can be parsed by standard JSON parsers

### Requirement 5: Message Retrieval from Storage

**User Story:** As the analysis system, I want to retrieve stored messages from the first segment, so that I can analyze them with Bedrock.

#### Acceptance Criteria

1. WHEN analysis is triggered, THE Message_Analyzer SHALL retrieve messages from the Message_Store
2. WHEN messages are retrieved, THE Message_Analyzer SHALL include message content, sender, timestamp, and metadata
3. IF message retrieval fails, THEN THE Message_Analyzer SHALL return an error indicating the retrieval failure
4. WHEN no messages are found, THE Message_Analyzer SHALL return an empty analysis result

### Requirement 6: Store Analysis Results in DynamoDB

**User Story:** As a downstream system component, I want analysis results persisted in DynamoDB, so that I can query and retrieve structured insights and timeline data.

#### Acceptance Criteria

1. WHEN analysis is complete, THE Message_Analyzer SHALL store the Analysis_Result in the Analysis_Table
2. THE Analysis_Table SHALL store the timeline as a List attribute containing timeline entry objects
3. THE Analysis_Table SHALL store decisions as a List attribute containing decision objects
4. THE Analysis_Table SHALL store risks as a List attribute containing risk/blocker objects
5. THE Analysis_Table SHALL store tasks as a List attribute containing task objects with priority
6. THE Analysis_Table SHALL store deadlines as a List attribute containing deadline objects
7. WHEN storing an Analysis_Record, THE Message_Analyzer SHALL include a unique identifier for the analysis
8. WHEN storing an Analysis_Record, THE Message_Analyzer SHALL include a timestamp indicating when the analysis was performed
9. WHEN storing an Analysis_Record, THE Message_Analyzer SHALL include a List attribute containing the message IDs that were analyzed
10. IF storage to DynamoDB fails, THEN THE Message_Analyzer SHALL return an error indicating the storage failure

### Requirement 7: Error Handling and Resilience

**User Story:** As a system operator, I want robust error handling, so that transient failures don't break the analysis pipeline.

#### Acceptance Criteria

1. IF Bedrock API rate limits are exceeded, THEN THE Bedrock_Client SHALL return a rate limit error
2. IF Bedrock invocation times out, THEN THE Bedrock_Client SHALL return a timeout error
3. IF message retrieval fails, THEN THE Message_Analyzer SHALL log the error and throw an exception
4. IF JSON parsing fails, THEN THE Message_Analyzer SHALL log the invalid response and throw an exception
5. WHEN an error occurs, THE system SHALL include the error type and message in the logs

## Manual Configuration Requirements

The following manual configuration steps are required to enable Bedrock integration:

### Bedrock Model Access

1. Navigate to AWS Console → Amazon Bedrock → Model access
2. Request access to the desired foundation model (e.g., Claude, Titan)
3. Wait for access approval (typically immediate for most models)
4. Note the model ID for configuration (e.g., "anthropic.claude-v2", "amazon.titan-text-express-v1")

### IAM Permissions

The Lambda execution role requires these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    }
  ]
}
```

### CDK Configuration

Add to CDK stack:
- Bedrock model ID as environment variable or SSM parameter
- IAM policy attachment for Lambda execution role
- Region configuration (Bedrock availability varies by region)

### Cost Considerations

- Bedrock charges per token (input + output)
- Monitor usage via CloudWatch metrics
- Consider implementing token limits per invocation
- Set up billing alerts for unexpected usage spikes

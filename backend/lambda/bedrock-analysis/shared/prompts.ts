/**
 * Prompt engineering templates for Bedrock message analysis
 */

/**
 * Message record interface for prompt formatting
 */
export interface MessageRecord {
  messageId: string;
  timestamp: string;
  source: 'gmail' | 'slack';
  sender: string;
  subject?: string;
  content: string;
  channelName?: string;
}

/**
 * System prompt for insight extraction
 * Instructs Bedrock to extract actionable insights while filtering noise
 */
export const INSIGHT_EXTRACTION_SYSTEM_PROMPT = `You are an AI assistant that analyzes workplace communications to extract actionable insights.

Focus only on explicit project-related information. You must exclude:
- Casual chatter and small talk
- Greetings (e.g., "Hi", "Hello", "Good morning")
- Signatures and sign-offs (e.g., "Best regards", "Thanks", "Cheers")
- Social pleasantries

Extract only information that is clearly stated in the messages. Do not infer or assume implied meaning.

Return results in valid JSON format matching the exact schema provided in the user prompt.`;

/**
 * User prompt template for insight extraction
 * Provides JSON schema and classification guidance
 */
export const INSIGHT_EXTRACTION_USER_PROMPT_TEMPLATE = `Analyze the following messages and extract actionable insights.

Extract the following types of information:

1. **Decisions**: Clear choices or conclusions that were made
2. **Risks/Blockers**: Issues, obstacles, or concerns that were raised
3. **Tasks**: Action items or work that needs to be done
4. **Deadlines**: Specific dates or timeframes that were mentioned

Classification Guidelines:

**Task Priority** (classify each task):
- **high**: Urgent or blocking work that must be done immediately
- **medium**: Important work that should be done soon
- **low**: Nice-to-have work that can be done later

**Risk Severity** (classify each risk):
- **critical**: Severe issues that block all progress or cause system failure
- **high**: Major issues that significantly impact the project
- **medium**: Moderate issues that cause some disruption
- **low**: Minor issues with minimal impact

Messages:
{messages}

Return JSON in this exact format:
{{
  "decisions": [
    {{
      "text": "The decision that was made",
      "context": "Additional context about the decision",
      "messageId": "ID of the message containing this decision"
    }}
  ],
  "risks": [
    {{
      "text": "The risk or blocker that was identified",
      "severity": "critical|high|medium|low",
      "messageId": "ID of the message containing this risk"
    }}
  ],
  "tasks": [
    {{
      "text": "The task or action item",
      "priority": "high|medium|low",
      "messageId": "ID of the message containing this task"
    }}
  ],
  "deadlines": [
    {{
      "text": "Description of what is due",
      "date": "ISO 8601 date string",
      "messageId": "ID of the message containing this deadline"
    }}
  ]
}}

Return only the JSON object, no additional text.`;

/**
 * System prompt for timeline generation
 * Instructs Bedrock to construct chronological timelines while filtering noise
 */
export const TIMELINE_GENERATION_SYSTEM_PROMPT = `You are an AI assistant that constructs chronological timelines from workplace communications.

Focus only on explicit project-related events. You must exclude:
- Casual chatter and small talk
- Greetings (e.g., "Hi", "Hello", "Good morning")
- Signatures and sign-offs (e.g., "Best regards", "Thanks", "Cheers")
- Social pleasantries

Create concise, factual timeline entries based only on what is clearly stated in the messages. Do not infer or assume implied meaning.

Return results in valid JSON format matching the exact schema provided in the user prompt.`;

/**
 * User prompt template for timeline generation
 * Provides JSON schema for timeline entries
 */
export const TIMELINE_GENERATION_USER_PROMPT_TEMPLATE = `Analyze the following chronologically sorted messages and create a concise timeline of project-related events.

Each timeline entry should be:
- A brief, factual statement about what happened
- Based only on explicit information in the messages
- Focused on project-related activities (not social interactions)

Messages (sorted chronologically):
{messages}

Return JSON in this exact format:
{{
  "timeline": [
    {{
      "timestamp": "ISO 8601 timestamp of when the event occurred",
      "event": "Brief description of what happened",
      "messageId": "ID of the message describing this event"
    }}
  ]
}}

Return only the JSON object, no additional text.`;

/**
 * Format messages for insight extraction prompt
 * Includes metadata (sender, timestamp, source) for context
 */
export function formatMessagesForInsightExtraction(messages: MessageRecord[]): string {
  return messages
    .map((msg, index) => {
      const parts = [
        `Message ${index + 1}:`,
        `- ID: ${msg.messageId}`,
        `- From: ${msg.sender}`,
        `- Timestamp: ${msg.timestamp}`,
        `- Source: ${msg.source}`,
      ];

      if (msg.subject) {
        parts.push(`- Subject: ${msg.subject}`);
      }

      if (msg.channelName) {
        parts.push(`- Channel: ${msg.channelName}`);
      }

      parts.push(`- Content: ${msg.content}`);
      parts.push(''); // Empty line between messages

      return parts.join('\n');
    })
    .join('\n');
}

/**
 * Format chronologically sorted messages for timeline generation
 * Emphasizes temporal ordering for timeline construction
 */
export function formatMessagesForTimelineGeneration(messages: MessageRecord[]): string {
  // Sort messages chronologically (earliest first)
  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return sortedMessages
    .map((msg, index) => {
      const parts = [
        `[${msg.timestamp}] Message ${index + 1}:`,
        `- ID: ${msg.messageId}`,
        `- From: ${msg.sender}`,
        `- Source: ${msg.source}`,
      ];

      if (msg.subject) {
        parts.push(`- Subject: ${msg.subject}`);
      }

      if (msg.channelName) {
        parts.push(`- Channel: ${msg.channelName}`);
      }

      parts.push(`- Content: ${msg.content}`);
      parts.push(''); // Empty line between messages

      return parts.join('\n');
    })
    .join('\n');
}

/**
 * Construct complete insight extraction prompt
 * Combines template with formatted messages
 */
export function constructInsightExtractionPrompt(messages: MessageRecord[]): string {
  const formattedMessages = formatMessagesForInsightExtraction(messages);
  return INSIGHT_EXTRACTION_USER_PROMPT_TEMPLATE.replace('{messages}', formattedMessages);
}

/**
 * Construct complete timeline generation prompt
 * Combines template with chronologically sorted messages
 */
export function constructTimelineGenerationPrompt(messages: MessageRecord[]): string {
  const formattedMessages = formatMessagesForTimelineGeneration(messages);
  return TIMELINE_GENERATION_USER_PROMPT_TEMPLATE.replace('{messages}', formattedMessages);
}

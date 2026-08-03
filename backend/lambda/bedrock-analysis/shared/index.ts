/**
 * Shared modules for Bedrock analysis Lambda functions
 */

export {
  BedrockClient,
  BedrockClientConfig,
  BedrockInvokeParams,
  BedrockResponse,
  BedrockError,
  BedrockErrorType,
} from './bedrock-client';

export {
  MessageRecord,
  INSIGHT_EXTRACTION_SYSTEM_PROMPT,
  INSIGHT_EXTRACTION_USER_PROMPT_TEMPLATE,
  TIMELINE_GENERATION_SYSTEM_PROMPT,
  TIMELINE_GENERATION_USER_PROMPT_TEMPLATE,
  formatMessagesForInsightExtraction,
  formatMessagesForTimelineGeneration,
  constructInsightExtractionPrompt,
  constructTimelineGenerationPrompt,
} from './prompts';

export {
  retrieveMessages,
  MessageRetrievalConfig,
} from './message-retrieval';

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
  InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Configuration for the Bedrock client
 */
export interface BedrockClientConfig {
  modelId: string;
  region?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Parameters for invoking Bedrock
 */
export interface BedrockInvokeParams {
  prompt: string;
  systemPrompt?: string;
}

/**
 * Error types for Bedrock invocations
 */
export type BedrockErrorType = 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'SYSTEM';

/**
 * Error details for failed Bedrock invocations
 */
export interface BedrockError {
  type: BedrockErrorType;
  message: string;
  details?: any;
}

/**
 * Response from Bedrock invocation
 */
export interface BedrockResponse<T> {
  success: boolean;
  data?: T;
  error?: BedrockError;
}

/**
 * Bedrock client abstraction for Amazon Bedrock API interactions
 * 
 * Provides a reusable interface for invoking Bedrock models with:
 * - IAM authentication
 * - Comprehensive error handling
 * - JSON response parsing and validation
 * - Structured logging
 */
export class BedrockClient {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private maxTokens: number;
  private temperature: number;

  /**
   * Create a new Bedrock client
   * 
   * @param config - Configuration for the client
   */
  constructor(config: BedrockClientConfig) {
    // Use environment variable for model ID if not provided
    this.modelId = config.modelId || process.env.MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;

    // Initialize AWS SDK v3 BedrockRuntimeClient with IAM authentication
    this.client = new BedrockRuntimeClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });

    console.log('BedrockClient initialized', {
      modelId: this.modelId,
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      maxTokens: this.maxTokens,
      temperature: this.temperature,
    });
  }

  /**
   * Invoke Bedrock model with the given prompt
   * 
   * @param params - Invocation parameters
   * @returns Response with parsed data or error
   */
  async invoke<T>(params: BedrockInvokeParams): Promise<BedrockResponse<T>> {
    const startTime = Date.now();
    
    try {
      // Construct the request body based on model family
      const requestBody = this.constructRequestBody(params);

      // Log invocation start
      console.log('Bedrock invocation started', {
        modelId: this.modelId,
        promptLength: params.prompt.length,
        hasSystemPrompt: !!params.systemPrompt,
        timestamp: new Date().toISOString(),
      });

      // Prepare the Bedrock API request
      const input: InvokeModelCommandInput = {
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      };

      // Invoke the model
      const command = new InvokeModelCommand(input);
      const response: InvokeModelCommandOutput = await this.client.send(command);

      // Parse the response
      const result = this.parseResponse<T>(response);

      // Log successful invocation
      const duration = Date.now() - startTime;
      console.log('Bedrock invocation completed', {
        modelId: this.modelId,
        duration,
        success: result.success,
        timestamp: new Date().toISOString(),
      });

      return result;

    } catch (error: any) {
      // Log error
      const duration = Date.now() - startTime;
      console.error('Bedrock invocation failed', {
        modelId: this.modelId,
        duration,
        error: error.message,
        errorName: error.name,
        timestamp: new Date().toISOString(),
      });

      // Classify and return error
      return this.handleError(error);
    }
  }

  /**
   * Construct request body based on model family
   */
  private constructRequestBody(params: BedrockInvokeParams): any {
    // Claude models use the Messages API format
    if (this.modelId.includes('anthropic.claude')) {
      const messages: any[] = [
        {
          role: 'user',
          content: params.prompt,
        },
      ];

      const body: any = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages,
      };

      // Add system prompt if provided
      if (params.systemPrompt) {
        body.system = params.systemPrompt;
      }

      return body;
    }

    // Titan models use a different format
    if (this.modelId.includes('amazon.titan')) {
      return {
        inputText: params.systemPrompt 
          ? `${params.systemPrompt}\n\n${params.prompt}`
          : params.prompt,
        textGenerationConfig: {
          maxTokenCount: this.maxTokens,
          temperature: this.temperature,
        },
      };
    }

    // Default format (fallback)
    return {
      prompt: params.systemPrompt 
        ? `${params.systemPrompt}\n\n${params.prompt}`
        : params.prompt,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };
  }

  /**
   * Parse Bedrock response and extract completion text
   */
  private parseResponse<T>(response: InvokeModelCommandOutput): BedrockResponse<T> {
    try {
      // Extract response body
      if (!response.body) {
        return {
          success: false,
          error: {
            type: 'INVALID_RESPONSE',
            message: 'Response body is empty',
          },
        };
      }

      // Decode the response body
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      // Extract completion text based on model family
      let completionText: string;

      if (this.modelId.includes('anthropic.claude')) {
        // Claude models return content in a specific format
        if (!responseBody.content || !Array.isArray(responseBody.content) || responseBody.content.length === 0) {
          return {
            success: false,
            error: {
              type: 'INVALID_RESPONSE',
              message: 'Claude response missing content array',
              details: responseBody,
            },
          };
        }
        completionText = responseBody.content[0].text;
      } else if (this.modelId.includes('amazon.titan')) {
        // Titan models return results in a different format
        if (!responseBody.results || !Array.isArray(responseBody.results) || responseBody.results.length === 0) {
          return {
            success: false,
            error: {
              type: 'INVALID_RESPONSE',
              message: 'Titan response missing results array',
              details: responseBody,
            },
          };
        }
        completionText = responseBody.results[0].outputText;
      } else {
        // Default format
        completionText = responseBody.completion || responseBody.text || responseBody.output;
      }

      if (!completionText) {
        return {
          success: false,
          error: {
            type: 'INVALID_RESPONSE',
            message: 'Could not extract completion text from response',
            details: responseBody,
          },
        };
      }

      // Attempt to parse as JSON
      try {
        const parsedData = JSON.parse(completionText) as T;
        
        // Log successful parsing
        console.log('Response parsed successfully', {
          modelId: this.modelId,
          responseLength: completionText.length,
        });

        return {
          success: true,
          data: parsedData,
        };
      } catch (jsonError: any) {
        // JSON parsing failed
        console.error('JSON parsing failed', {
          modelId: this.modelId,
          completionText: completionText.substring(0, 500), // Log first 500 chars
          error: jsonError.message,
        });

        return {
          success: false,
          error: {
            type: 'INVALID_RESPONSE',
            message: 'Failed to parse response as JSON',
            details: {
              completionText: completionText.substring(0, 500),
              parseError: jsonError.message,
            },
          },
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: {
          type: 'INVALID_RESPONSE',
          message: 'Failed to decode response body',
          details: error.message,
        },
      };
    }
  }

  /**
   * Handle and classify errors from Bedrock invocations
   */
  private handleError(error: any): BedrockResponse<never> {
    // Authentication errors
    if (error.name === 'UnauthorizedException' || 
        error.name === 'AccessDeniedException' ||
        error.$metadata?.httpStatusCode === 401 ||
        error.$metadata?.httpStatusCode === 403) {
      return {
        success: false,
        error: {
          type: 'AUTH',
          message: 'Authentication or authorization failed',
          details: {
            name: error.name,
            message: error.message,
          },
        },
      };
    }

    // Rate limit errors
    if (error.name === 'ThrottlingException' ||
        error.name === 'TooManyRequestsException' ||
        error.$metadata?.httpStatusCode === 429) {
      return {
        success: false,
        error: {
          type: 'RATE_LIMIT',
          message: 'Bedrock API rate limit exceeded',
          details: {
            name: error.name,
            message: error.message,
          },
        },
      };
    }

    // Timeout errors
    if (error.name === 'TimeoutError' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('timeout')) {
      return {
        success: false,
        error: {
          type: 'TIMEOUT',
          message: 'Bedrock invocation timed out',
          details: {
            name: error.name,
            message: error.message,
          },
        },
      };
    }

    // System/network errors (default)
    return {
      success: false,
      error: {
        type: 'SYSTEM',
        message: error.message || 'Unexpected error during Bedrock invocation',
        details: {
          name: error.name,
          message: error.message,
          code: error.code,
        },
      },
    };
  }
}

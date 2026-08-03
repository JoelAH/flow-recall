/**
 * Slack API Client for Data Ingestion Pipeline
 * 
 * Handles Slack API authentication, message fetching with pagination,
 * rate limiting, and error handling.
 */

import { SlackTokens } from './token-manager';
import { retryWithBackoff } from './retry';
import { SlackMessage } from './normalization';

/**
 * Slack API client configuration
 */
export interface SlackClientConfig {
  tokens: SlackTokens;
}

/**
 * Slack message fetch options
 */
export interface SlackFetchOptions {
  startDate: string;  // ISO 8601 format
  endDate: string;    // ISO 8601 format
  searchTopic?: string;
}

/**
 * Slack API error types
 */
export class SlackAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackAuthError';
  }
}

export class SlackRateLimitError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'SlackRateLimitError';
  }
}

/**
 * Slack API response for search.messages
 */
interface SlackSearchResponse {
  ok: boolean;
  error?: string;
  messages?: {
    matches: SlackMessage[];
    pagination?: {
      page: number;
      page_count: number;
    };
  };
  response_metadata?: {
    next_cursor?: string;
  };
}

/**
 * Slack API Client
 */
export class SlackClient {
  private tokens: SlackTokens;
  private baseUrl = 'https://slack.com/api';

  constructor(config: SlackClientConfig) {
    this.tokens = config.tokens;
  }

  /**
   * Builds Slack search query from date range and optional topic
   */
  private buildSearchQuery(options: SlackFetchOptions): string {
    const startDate = this.formatDateForSlack(options.startDate);
    const endDate = this.formatDateForSlack(options.endDate);
    
    let query = `after:${startDate} before:${endDate}`;
    
    if (options.searchTopic) {
      query += ` ${options.searchTopic}`;
    }
    
    return query;
  }

  /**
   * Formats ISO 8601 date to Slack date format (YYYY-MM-DD)
   */
  private formatDateForSlack(isoDate: string): string {
    const date = new Date(isoDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Makes an HTTP request to Slack API
   */
  private async makeRequest(
    endpoint: string,
    params: Record<string, string>
  ): Promise<any> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Check for rate limiting via HTTP status
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new SlackRateLimitError(
        'Slack API rate limit exceeded',
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
      );
    }

    // Check for other HTTP errors
    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Handles Slack API errors and converts to appropriate error types
   */
  private handleSlackError(error: any, data?: any): never {
    const errorCode = data?.error || error.message;

    console.error('Slack API error', {
      error: errorCode,
      message: error.message,
      data,
    });

    // Authentication errors
    if (errorCode === 'invalid_auth' || errorCode === 'not_authed' || errorCode === 'token_expired') {
      throw new SlackAuthError(
        errorCode === 'token_expired'
          ? 'Slack OAuth token expired'
          : 'Slack authentication failed'
      );
    }

    // Rate limit errors
    if (errorCode === 'rate_limited' || error instanceof SlackRateLimitError) {
      throw error instanceof SlackRateLimitError 
        ? error 
        : new SlackRateLimitError('Slack API rate limit exceeded');
    }

    // Other errors
    throw error;
  }

  /**
   * Fetches a single page of Slack messages
   */
  private async fetchMessagesPage(
    query: string,
    page: number = 1
  ): Promise<{ messages: SlackMessage[]; hasMore: boolean }> {
    try {
      const data: SlackSearchResponse = await this.makeRequest('search.messages', {
        query,
        count: '100',
        page: page.toString(),
      });

      // Check if request was successful
      if (!data.ok) {
        this.handleSlackError(new Error('Slack API request failed'), data);
      }

      const messages = data.messages?.matches || [];
      const pagination = data.messages?.pagination;
      const hasMore = pagination ? page < pagination.page_count : false;

      return { messages, hasMore };
    } catch (error) {
      this.handleSlackError(error);
    }
  }

  /**
   * Fetches all Slack messages matching the search criteria with pagination
   * Includes retry logic for rate limits and transient errors
   */
  async fetchMessages(options: SlackFetchOptions): Promise<SlackMessage[]> {
    const query = this.buildSearchQuery(options);
    const messages: SlackMessage[] = [];
    let page = 1;
    let hasMore = true;

    console.log('Fetching Slack messages', {
      query,
      startDate: options.startDate,
      endDate: options.endDate,
      searchTopic: options.searchTopic,
    });

    // Fetch all pages
    while (hasMore) {
      const result = await retryWithBackoff(
        () => this.fetchMessagesPage(query, page),
        `Slack messages fetch: page ${page}`
      );

      messages.push(...result.messages);
      hasMore = result.hasMore;
      page++;
    }

    console.log('Slack messages fetched successfully', {
      count: messages.length,
      query,
    });

    return messages;
  }

  /**
   * Gets the current access token (useful for debugging or token updates)
   */
  getAccessToken(): string {
    return this.tokens.accessToken;
  }

  /**
   * Gets the token expiration timestamp
   */
  getTokenExpiresAt(): number {
    return this.tokens.expiresAt;
  }

  /**
   * Gets the workspace information
   */
  getWorkspaceInfo(): { workspaceId: string; workspaceName: string; userId: string } {
    return {
      workspaceId: this.tokens.workspaceId,
      workspaceName: this.tokens.workspaceName,
      userId: this.tokens.userId,
    };
  }
}

/**
 * Creates a Slack API client with the provided tokens
 */
export function createSlackClient(tokens: SlackTokens): SlackClient {
  return new SlackClient({ tokens });
}

/**
 * Gmail API Client for Data Ingestion Pipeline
 * 
 * Handles Gmail API authentication, message fetching with pagination,
 * rate limiting, and error handling.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GmailTokens } from './token-manager';
import { retryWithBackoff } from './retry';
import { GmailMessage } from './normalization';

// Environment variables for OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Gmail API client configuration
 */
export interface GmailClientConfig {
  tokens: GmailTokens;
  clientId?: string;
  clientSecret?: string;
}

/**
 * Gmail message fetch options
 */
export interface GmailFetchOptions {
  startDate: string;  // ISO 8601 format
  endDate: string;    // ISO 8601 format
  searchTopic?: string;
}

/**
 * Gmail API error types
 */
export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailAuthError';
  }
}

export class GmailRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailRateLimitError';
  }
}

/**
 * Gmail API Client
 */
export class GmailClient {
  private oauth2Client: OAuth2Client;
  private gmail: any;
  private tokens: GmailTokens;

  constructor(config: GmailClientConfig) {
    this.tokens = config.tokens;
    
    // Initialize OAuth2 client
    this.oauth2Client = new OAuth2Client(
      config.clientId || GOOGLE_CLIENT_ID,
      config.clientSecret || GOOGLE_CLIENT_SECRET
    );

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: config.tokens.accessToken,
      refresh_token: config.tokens.refreshToken,
      expiry_date: config.tokens.expiresAt,
    });

    // Handle token refresh
    this.oauth2Client.on('tokens', (tokens) => {
      if (tokens.access_token) {
        console.log('Gmail access token refreshed', {
          expiresAt: tokens.expiry_date,
        });
        // Update internal token reference
        this.tokens.accessToken = tokens.access_token;
        if (tokens.expiry_date) {
          this.tokens.expiresAt = tokens.expiry_date;
        }
      }
    });

    // Initialize Gmail API client
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * Builds Gmail search query from date range and optional topic
   */
  private buildSearchQuery(options: GmailFetchOptions): string {
    const startDate = this.formatDateForGmail(options.startDate);
    const endDate = this.formatDateForGmail(options.endDate);
    
    let query = `after:${startDate} before:${endDate}`;
    
    if (options.searchTopic) {
      // Search in both subject and body
      query += ` (subject:${options.searchTopic} OR ${options.searchTopic})`;
    }
    
    return query;
  }

  /**
   * Formats ISO 8601 date to Gmail date format (YYYY/MM/DD)
   */
  private formatDateForGmail(isoDate: string): string {
    const date = new Date(isoDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * Handles Gmail API errors and converts to appropriate error types
   */
  private handleGmailError(error: any): never {
    const statusCode = error.code || error.response?.status;
    const errorMessage = error.message || 'Unknown Gmail API error';

    console.error('Gmail API error', {
      statusCode,
      message: errorMessage,
      error: error.response?.data || error,
    });

    // Authentication errors
    if (statusCode === 401 || statusCode === 403) {
      throw new GmailAuthError(
        statusCode === 401
          ? 'Gmail OAuth token expired or invalid'
          : 'Gmail API access denied'
      );
    }

    // Rate limit errors
    if (statusCode === 429) {
      throw new GmailRateLimitError('Gmail API rate limit exceeded');
    }

    // Server errors (5xx)
    if (statusCode >= 500) {
      const err = new Error(`Gmail API server error: ${errorMessage}`);
      (err as any).statusCode = statusCode;
      throw err;
    }

    // Other errors
    throw error;
  }

  /**
   * Fetches a single page of message IDs
   */
  private async fetchMessageIdsPage(
    query: string,
    pageToken?: string
  ): Promise<{ messageIds: string[]; nextPageToken?: string }> {
    try {
      console.log('Fetching Gmail message IDs', { query, pageToken });
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        pageToken,
      });
      
      const messageIds = response.data.messages?.map((m: any) => m.id) || [];
      const nextPageToken = response.data.nextPageToken;
      
      console.log('Gmail message IDs fetched', { 
        count: messageIds.length, 
        hasNextPage: !!nextPageToken 
      });
      
      return { messageIds, nextPageToken };
    } catch (error) {
      this.handleGmailError(error);
    }
  }

  /**
   * Fetches full message details by ID
   */
  private async fetchMessageById(messageId: string): Promise<GmailMessage> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });
      
      return response.data as GmailMessage;
    } catch (error) {
      this.handleGmailError(error);
    }
  }

  /**
   * Fetches all Gmail messages matching the search criteria with pagination
   * Includes retry logic for rate limits and transient errors
   */
  async fetchMessages(options: GmailFetchOptions): Promise<GmailMessage[]> {
    const query = this.buildSearchQuery(options);
    const messages: GmailMessage[] = [];
    let pageToken: string | undefined;

    console.log('Fetching Gmail messages', {
      query,
      startDate: options.startDate,
      endDate: options.endDate,
      searchTopic: options.searchTopic,
    });

    // Fetch all message IDs with pagination
    do {
      const page = await retryWithBackoff(
        () => this.fetchMessageIdsPage(query, pageToken),
        'Gmail message IDs fetch by page'
      );

      // Fetch full message details for each ID
      for (const messageId of page.messageIds) {
        const message = await retryWithBackoff(
          () => this.fetchMessageById(messageId),
          `Gmail message fetch: ${messageId}`
        );
        messages.push(message);
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

    console.log('Gmail messages fetched successfully', {
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
}

/**
 * Creates a Gmail API client with the provided tokens
 */
export function createGmailClient(tokens: GmailTokens): GmailClient {
  return new GmailClient({ tokens });
}

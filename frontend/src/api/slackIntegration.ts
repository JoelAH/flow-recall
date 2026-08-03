import { getTokens } from '../context/AuthContext';

/**
 * API Gateway base URL
 * This should be configured based on the deployed API Gateway URL
 * For development, this can be set via environment variable
 */
const API_BASE_URL = import.meta.env.VITE_SLACK_API_GATEWAY_URL || 'https://0qg3y2m6l6.execute-api.us-east-1.amazonaws.com/prod';

/**
 * Integration status response from the backend
 */
export interface IntegrationStatus {
  status: 'connected' | 'disconnected' | 'error';
  workspaceName?: string;
  connectedAt?: string;
  errorMessage?: string;
}

/**
 * Authorization URL response from the backend
 */
export interface AuthorizationResponse {
  authorizationUrl: string;
}

/**
 * Disconnect response from the backend
 */
export interface DisconnectResponse {
  success: boolean;
  message?: string;
}

/**
 * Custom error class for API errors with user-friendly messages
 */
export class SlackIntegrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'SlackIntegrationError';
  }
}

/**
 * Get the Cognito ID token from localStorage and format it for the Authorization header
 * @returns Authorization header value or null if not authenticated
 */
function getAuthorizationHeader(): string | null {
  const tokens = getTokens();
  if (!tokens || !tokens.idToken) {
    return null;
  }
  return `Bearer ${tokens.idToken}`;
}

/**
 * Handle API errors and convert them to user-friendly messages
 * @param error - The error from the fetch request
 * @param defaultMessage - Default message if no specific error is found
 * @returns SlackIntegrationError with user-friendly message
 */
function handleApiError(error: unknown, defaultMessage: string): SlackIntegrationError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new SlackIntegrationError(
      'Connection failed. Please check your internet connection and try again.',
      undefined,
      error
    );
  }

  // HTTP errors with response
  if (error instanceof Response) {
    switch (error.status) {
      case 401:
        return new SlackIntegrationError(
          'Your session has expired. Please log in again.',
          401,
          error
        );
      case 403:
        return new SlackIntegrationError(
          'You do not have permission to perform this action.',
          403,
          error
        );
      case 404:
        return new SlackIntegrationError(
          'The requested resource was not found.',
          404,
          error
        );
      case 429:
        return new SlackIntegrationError(
          'Too many requests. Please wait a moment and try again.',
          429,
          error
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new SlackIntegrationError(
          'Server error. Please try again later.',
          error.status,
          error
        );
      default:
        return new SlackIntegrationError(
          defaultMessage,
          error.status,
          error
        );
    }
  }

  // Generic error
  return new SlackIntegrationError(defaultMessage, undefined, error);
}

/**
 * Initiate the Slack OAuth flow
 * 
 * This function calls the backend to generate an OAuth authorization URL
 * with a state token for CSRF protection. The frontend should redirect
 * the user to this URL to begin the OAuth flow.
 * 
 * @returns Promise resolving to the authorization URL
 * @throws SlackIntegrationError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const { authorizationUrl } = await initiateOAuth();
 *   window.location.href = authorizationUrl;
 * } catch (error) {
 *   console.error('Failed to initiate OAuth:', error.message);
 * }
 * ```
 */
export async function initiateOAuth(): Promise<AuthorizationResponse> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new SlackIntegrationError(
      'You must be logged in to connect Slack.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/slack/authorize`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw response;
    }

    const data = await response.json();
    return data as AuthorizationResponse;
  } catch (error) {
    throw handleApiError(
      error,
      'Failed to initiate Slack connection. Please try again.'
    );
  }
}

/**
 * Get the current Slack integration status
 * 
 * This function fetches the current connection status for the authenticated user,
 * including whether Slack is connected, the connected workspace name, and when
 * the connection was established.
 * 
 * @returns Promise resolving to the integration status
 * @throws SlackIntegrationError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const status = await getIntegrationStatus();
 *   if (status.status === 'connected') {
 *     console.log(`Connected to ${status.workspaceName}`);
 *   }
 * } catch (error) {
 *   console.error('Failed to get status:', error.message);
 * }
 * ```
 */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new SlackIntegrationError(
      'You must be logged in to check integration status.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/slack/status`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw response;
    }

    const data = await response.json();
    return data as IntegrationStatus;
  } catch (error) {
    throw handleApiError(
      error,
      'Failed to retrieve Slack connection status. Please try again.'
    );
  }
}

/**
 * Disconnect the Slack integration
 * 
 * This function removes the Slack OAuth tokens from the backend and revokes
 * the tokens with Slack. After disconnection, the user will need to
 * reconnect to grant access again.
 * 
 * @returns Promise resolving to the disconnect result
 * @throws SlackIntegrationError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await disconnectIntegration();
 *   if (result.success) {
 *     console.log('Slack disconnected successfully');
 *   }
 * } catch (error) {
 *   console.error('Failed to disconnect:', error.message);
 * }
 * ```
 */
export async function disconnectIntegration(): Promise<DisconnectResponse> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new SlackIntegrationError(
      'You must be logged in to disconnect Slack.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/slack/disconnect`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw response;
    }

    const data = await response.json();
    return data as DisconnectResponse;
  } catch (error) {
    throw handleApiError(
      error,
      'Failed to disconnect Slack. Please try again.'
    );
  }
}

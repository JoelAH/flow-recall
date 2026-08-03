import { getTokens } from '../context/AuthContext';

/**
 * API Gateway base URL
 * This should be configured based on the deployed API Gateway URL
 * For development, this can be set via environment variable
 */
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'https://fx712l57ag.execute-api.us-east-1.amazonaws.com/prod/';

/**
 * Integration status response from the backend
 */
export interface IntegrationStatus {
  status: 'connected' | 'disconnected' | 'error';
  email?: string;
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
export class GmailIntegrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'GmailIntegrationError';
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
 * @returns GmailIntegrationError with user-friendly message
 */
function handleApiError(error: unknown, defaultMessage: string): GmailIntegrationError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new GmailIntegrationError(
      'Connection failed. Please check your internet connection and try again.',
      undefined,
      error
    );
  }

  // HTTP errors with response
  if (error instanceof Response) {
    switch (error.status) {
      case 401:
        return new GmailIntegrationError(
          'Your session has expired. Please log in again.',
          401,
          error
        );
      case 403:
        return new GmailIntegrationError(
          'You do not have permission to perform this action.',
          403,
          error
        );
      case 404:
        return new GmailIntegrationError(
          'The requested resource was not found.',
          404,
          error
        );
      case 429:
        return new GmailIntegrationError(
          'Too many requests. Please wait a moment and try again.',
          429,
          error
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new GmailIntegrationError(
          'Server error. Please try again later.',
          error.status,
          error
        );
      default:
        return new GmailIntegrationError(
          defaultMessage,
          error.status,
          error
        );
    }
  }

  // Generic error
  return new GmailIntegrationError(defaultMessage, undefined, error);
}

/**
 * Initiate the Gmail OAuth flow
 * 
 * This function calls the backend to generate an OAuth authorization URL
 * with a state token for CSRF protection. The frontend should redirect
 * the user to this URL to begin the OAuth flow.
 * 
 * @returns Promise resolving to the authorization URL
 * @throws GmailIntegrationError if the request fails
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
    throw new GmailIntegrationError(
      'You must be logged in to connect Gmail.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/authorize`, {
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
      'Failed to initiate Gmail connection. Please try again.'
    );
  }
}

/**
 * Get the current Gmail integration status
 * 
 * This function fetches the current connection status for the authenticated user,
 * including whether Gmail is connected, the connected email address, and when
 * the connection was established.
 * 
 * @returns Promise resolving to the integration status
 * @throws GmailIntegrationError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const status = await getIntegrationStatus();
 *   if (status.status === 'connected') {
 *     console.log(`Connected to ${status.email}`);
 *   }
 * } catch (error) {
 *   console.error('Failed to get status:', error.message);
 * }
 * ```
 */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new GmailIntegrationError(
      'You must be logged in to check integration status.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/status`, {
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
      'Failed to retrieve Gmail connection status. Please try again.'
    );
  }
}

/**
 * Disconnect the Gmail integration
 * 
 * This function removes the Gmail OAuth tokens from the backend and revokes
 * the tokens with Google. After disconnection, the user will need to
 * reconnect to grant access again.
 * 
 * @returns Promise resolving to the disconnect result
 * @throws GmailIntegrationError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await disconnectIntegration();
 *   if (result.success) {
 *     console.log('Gmail disconnected successfully');
 *   }
 * } catch (error) {
 *   console.error('Failed to disconnect:', error.message);
 * }
 * ```
 */
export async function disconnectIntegration(): Promise<DisconnectResponse> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new GmailIntegrationError(
      'You must be logged in to disconnect Gmail.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/disconnect`, {
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
      'Failed to disconnect Gmail. Please try again.'
    );
  }
}

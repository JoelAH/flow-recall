import { getTokens } from '../context/AuthContext';

/**
 * API Gateway base URL
 * This should be configured based on the deployed API Gateway URL
 * For development, this can be set via environment variable
 */
const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || 'https://azycuh4fv5.execute-api.us-east-1.amazonaws.com/prod';

/**
 * Job creation request payload
 */
export interface CreateJobRequest {
  startDate: string;      // ISO 8601 format
  endDate: string;        // ISO 8601 format
  searchTopic?: string;   // Optional, 1-500 characters
}

/**
 * Job creation response from the backend
 */
export interface CreateJobResponse {
  jobId: string;
  status: 'PROCESSING';
  startDate: string;
  endDate: string;
  searchTopic?: string;
  createdAt: string;
}

/**
 * Job status response from the backend
 */
export interface JobStatusResponse {
  jobId: string;
  userId: string;
  status: 'PROCESSING' | 'DONE' | 'FAILED';
  startDate: string;
  endDate: string;
  searchTopic?: string;
  createdAt: string;
  completedAt?: string;
  messageCount?: number;  // Only present when status is "DONE"
  errorMessage?: string;  // Only present when status is "FAILED"
}

/**
 * Custom error class for data ingestion API errors
 */
export class DataIngestionError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'DataIngestionError';
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
 * @returns DataIngestionError with user-friendly message
 */
async function handleApiError(error: unknown, defaultMessage: string): Promise<DataIngestionError> {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new DataIngestionError(
      'Connection failed. Please check your internet connection and try again.',
      undefined,
      error
    );
  }

  // HTTP errors with response
  if (error instanceof Response) {
    let errorMessage = defaultMessage;
    
    // Try to extract error message from response body
    try {
      const errorData = await error.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // If parsing fails, use default message
    }

    switch (error.status) {
      case 400:
        return new DataIngestionError(
          errorMessage || 'Invalid request. Please check your input and try again.',
          400,
          error
        );
      case 401:
        return new DataIngestionError(
          'Your session has expired. Please log in again.',
          401,
          error
        );
      case 403:
        return new DataIngestionError(
          'You do not have permission to perform this action.',
          403,
          error
        );
      case 404:
        return new DataIngestionError(
          'The requested job was not found.',
          404,
          error
        );
      case 429:
        return new DataIngestionError(
          'You have reached the maximum number of concurrent jobs (5). Please wait for a job to complete before starting a new one.',
          429,
          error
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new DataIngestionError(
          'Server error. Please try again later.',
          error.status,
          error
        );
      default:
        return new DataIngestionError(
          errorMessage,
          error.status,
          error
        );
    }
  }

  // Generic error
  return new DataIngestionError(defaultMessage, undefined, error);
}

/**
 * Convert date range dropdown value to start and end dates
 * @param dateRange - The date range dropdown value
 * @returns Object with startDate and endDate in ISO 8601 format
 */
export function convertDateRangeToISO(dateRange: string): { startDate: string; endDate: string } {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  
  const endDate = today.toISOString();
  
  let daysAgo: number;
  switch (dateRange) {
    case 'last-7-days':
      daysAgo = 7;
      break;
    case 'last-month':
      daysAgo = 30;
      break;
    case 'last-quarter':
      daysAgo = 90;
      break;
    case 'last-year':
      daysAgo = 365;
      break;
    default:
      daysAgo = 7; // Default to last 7 days
  }
  
  const startDateObj = new Date(today);
  startDateObj.setDate(startDateObj.getDate() - daysAgo);
  startDateObj.setHours(0, 0, 0, 0); // Start of the day
  const startDate = startDateObj.toISOString();
  
  return { startDate, endDate };
}

/**
 * Validate search topic length
 * @param searchTopic - The search topic string
 * @returns Error message if invalid, null if valid
 */
export function validateSearchTopic(searchTopic: string): string | null {
  if (searchTopic.length === 0) {
    return null; // Empty is valid (optional field)
  }
  
  if (searchTopic.length < 1 || searchTopic.length > 500) {
    return 'Search topic must be between 1 and 500 characters';
  }
  
  return null;
}

/**
 * Create a new data ingestion job
 * 
 * This function creates a job to fetch workplace communications within
 * the specified date range and optional search topic.
 * 
 * @param request - Job creation request with startDate, endDate, and optional searchTopic
 * @returns Promise resolving to the created job details
 * @throws DataIngestionError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const job = await createJob({
 *     startDate: '2024-01-01T00:00:00.000Z',
 *     endDate: '2024-01-07T23:59:59.999Z',
 *     searchTopic: 'project alpha'
 *   });
 *   console.log(`Job created: ${job.jobId}`);
 * } catch (error) {
 *   console.error('Failed to create job:', error.message);
 * }
 * ```
 */
export async function createJob(request: CreateJobRequest): Promise<CreateJobResponse> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new DataIngestionError(
      'You must be logged in to create a data ingestion job.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw response;
    }

    const data = await response.json();
    return data as CreateJobResponse;
  } catch (error) {
    throw await handleApiError(
      error,
      'Failed to create data ingestion job. Please try again.'
    );
  }
}

/**
 * Get the status of a data ingestion job
 * 
 * This function fetches the current status of a job, including whether
 * it's still processing, completed successfully, or failed.
 * 
 * @param jobId - The unique job identifier
 * @returns Promise resolving to the job status
 * @throws DataIngestionError if the request fails
 * 
 * @example
 * ```typescript
 * try {
 *   const status = await getJobStatus('job-123');
 *   if (status.status === 'DONE') {
 *     console.log(`Job completed with ${status.messageCount} messages`);
 *   }
 * } catch (error) {
 *   console.error('Failed to get job status:', error.message);
 * }
 * ```
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const authHeader = getAuthorizationHeader();
  
  if (!authHeader) {
    throw new DataIngestionError(
      'You must be logged in to check job status.',
      401
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
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
    return data as JobStatusResponse;
  } catch (error) {
    throw await handleApiError(
      error,
      'Failed to retrieve job status. Please try again.'
    );
  }
}

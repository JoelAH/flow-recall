/**
 * Retry logic utilities with exponential backoff
 * Handles API rate limits and transient errors
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  multiplier: number;
}

export const RATE_LIMIT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000, // 1 second
  maxDelay: 32000, // 32 seconds
  multiplier: 2,
};

export const TRANSIENT_ERROR_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 32000,
  multiplier: 2,
};

/**
 * Calculates exponential backoff delay
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = RATE_LIMIT_RETRY_CONFIG
): number {
  const delay = config.baseDelay * Math.pow(config.multiplier, attempt);
  return Math.min(delay, config.maxDelay);
}

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Logs retry attempt to CloudWatch
 */
function logRetryAttempt(
  attempt: number,
  maxRetries: number,
  error: Error,
  delay: number,
  context: string
): void {
  console.log(JSON.stringify({
    level: 'WARN',
    message: 'Retrying operation',
    context,
    attempt,
    maxRetries,
    delayMs: delay,
    error: error.message,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Wraps an async function with retry logic for rate limits
 */
export async function retryWithRateLimit<T>(
  fn: () => Promise<T>,
  context: string,
  config: RetryConfig = RATE_LIMIT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if this is a rate limit error
      const isRateLimit = 
        (error as any).code === 429 ||
        (error as any).statusCode === 429 ||
        (error as any).message?.includes('rate_limited') ||
        (error as any).message?.includes('Rate limit');

      if (!isRateLimit || attempt === config.maxRetries) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logRetryAttempt(attempt + 1, config.maxRetries, lastError, delay, context);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Wraps an async function with retry logic for transient errors
 */
export async function retryWithTransientErrors<T>(
  fn: () => Promise<T>,
  context: string,
  config: RetryConfig = TRANSIENT_ERROR_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if this is a transient error (network, timeout, 5xx)
      const isTransient =
        (error as any).code === 'ECONNRESET' ||
        (error as any).code === 'ETIMEDOUT' ||
        (error as any).code === 'ENOTFOUND' ||
        (error as any).statusCode >= 500 ||
        (error as any).message?.includes('timeout') ||
        (error as any).message?.includes('network');

      if (!isTransient || attempt === config.maxRetries) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logRetryAttempt(attempt + 1, config.maxRetries, lastError, delay, context);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Wraps an async function with combined retry logic (rate limits + transient errors)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  rateLimitConfig: RetryConfig = RATE_LIMIT_RETRY_CONFIG,
  transientConfig: RetryConfig = TRANSIENT_ERROR_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;
  const maxAttempts = Math.max(rateLimitConfig.maxRetries, transientConfig.maxRetries);

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Determine error type and appropriate config
      const isRateLimit = 
        (error as any).code === 429 ||
        (error as any).statusCode === 429 ||
        (error as any).message?.includes('rate_limited') ||
        (error as any).message?.includes('Rate limit');

      const isTransient =
        (error as any).code === 'ECONNRESET' ||
        (error as any).code === 'ETIMEDOUT' ||
        (error as any).code === 'ENOTFOUND' ||
        (error as any).statusCode >= 500 ||
        (error as any).message?.includes('timeout') ||
        (error as any).message?.includes('network');

      const config = isRateLimit ? rateLimitConfig : transientConfig;
      const shouldRetry = (isRateLimit || isTransient) && attempt < config.maxRetries;

      if (!shouldRetry) {
        throw error;
      }

      const delay = calculateBackoffDelay(attempt, config);
      logRetryAttempt(attempt + 1, config.maxRetries, lastError, delay, context);
      await sleep(delay);
    }
  }

  throw lastError!;
}

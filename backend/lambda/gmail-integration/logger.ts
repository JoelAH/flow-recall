/**
 * Structured Logger for Gmail Integration
 * 
 * Provides structured logging to CloudWatch with consistent format
 * for OAuth flow events, token operations, and security events.
 * 
 * Security: Never logs unencrypted tokens (only last 4 characters for debugging)
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum EventType {
  // OAuth flow events
  OAUTH_INITIATION = 'oauth_initiation',
  OAUTH_CALLBACK = 'oauth_callback',
  OAUTH_SUCCESS = 'oauth_success',
  OAUTH_FAILURE = 'oauth_failure',
  OAUTH_CANCELLED = 'oauth_cancelled',
  
  // Token operations
  TOKEN_STORE = 'token_store',
  TOKEN_RETRIEVE = 'token_retrieve',
  TOKEN_REFRESH = 'token_refresh',
  TOKEN_DELETE = 'token_delete',
  TOKEN_ENCRYPT = 'token_encrypt',
  TOKEN_DECRYPT = 'token_decrypt',
  
  // Authentication events
  AUTH_FAILURE = 'auth_failure',
  AUTH_SUCCESS = 'auth_success',
  
  // Security events
  SECURITY_INVALID_STATE = 'security_invalid_state',
  SECURITY_EXPIRED_STATE = 'security_expired_state',
  SECURITY_UNAUTHORIZED_ACCESS = 'security_unauthorized_access',
  
  // Error events
  KMS_ERROR = 'kms_error',
  DYNAMODB_ERROR = 'dynamodb_error',
  GOOGLE_API_ERROR = 'google_api_error',
}

interface LogContext {
  userId?: string;
  requestId?: string;
  eventType?: EventType;
  statusCode?: number;
  error?: string;
  errorDetails?: string;
  tokenLastChars?: string; // Only last 4 characters for debugging
  [key: string]: unknown;
}

/**
 * Structured logger class
 */
export class Logger {
  private requestId?: string;

  constructor(requestId?: string) {
    this.requestId = requestId;
  }

  /**
   * Log a structured message to CloudWatch
   */
  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: this.requestId || context.requestId,
      ...context,
    };

    // Use console methods for CloudWatch integration
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(JSON.stringify(logEntry));
        break;
      case LogLevel.INFO:
        console.log(JSON.stringify(logEntry));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(logEntry));
        break;
      case LogLevel.ERROR:
        console.error(JSON.stringify(logEntry));
        break;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log error message
   */
  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Log OAuth initiation event
   */
  logOAuthInitiation(userId: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('OAuth flow initiated', {
        userId,
        eventType: EventType.OAUTH_INITIATION,
      });
    } else {
      this.error('OAuth initiation failed', {
        userId,
        eventType: EventType.OAUTH_FAILURE,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log OAuth callback event
   */
  logOAuthCallback(userId: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('OAuth callback processed successfully', {
        userId,
        eventType: EventType.OAUTH_CALLBACK,
      });
    } else {
      this.error('OAuth callback processing failed', {
        userId,
        eventType: EventType.OAUTH_FAILURE,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log OAuth success event
   */
  logOAuthSuccess(userId: string, email: string): void {
    this.info('OAuth flow completed successfully', {
      userId,
      email,
      eventType: EventType.OAUTH_SUCCESS,
    });
  }

  /**
   * Log OAuth cancellation event
   */
  logOAuthCancelled(userId?: string): void {
    this.info('OAuth flow cancelled by user', {
      userId,
      eventType: EventType.OAUTH_CANCELLED,
    });
  }

  /**
   * Log token storage event
   */
  logTokenStore(userId: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('Tokens stored successfully', {
        userId,
        eventType: EventType.TOKEN_STORE,
      });
    } else {
      this.error('Token storage failed', {
        userId,
        eventType: EventType.TOKEN_STORE,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log token retrieval event
   */
  logTokenRetrieve(userId: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('Tokens retrieved successfully', {
        userId,
        eventType: EventType.TOKEN_RETRIEVE,
      });
    } else {
      this.error('Token retrieval failed', {
        userId,
        eventType: EventType.TOKEN_RETRIEVE,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log token refresh event
   */
  logTokenRefresh(userId: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('Tokens refreshed successfully', {
        userId,
        eventType: EventType.TOKEN_REFRESH,
      });
    } else {
      this.error('Token refresh failed', {
        userId,
        eventType: EventType.TOKEN_REFRESH,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log token deletion event
   */
  logTokenDelete(userId: string, success: boolean, error?: Error): void {
    if (success) {
      this.info('Tokens deleted successfully', {
        userId,
        eventType: EventType.TOKEN_DELETE,
      });
    } else {
      this.error('Token deletion failed', {
        userId,
        eventType: EventType.TOKEN_DELETE,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log token encryption event (only last 4 characters for debugging)
   */
  logTokenEncrypt(tokenLastChars: string, success: boolean, error?: Error): void {
    if (success) {
      this.debug('Token encrypted successfully', {
        eventType: EventType.TOKEN_ENCRYPT,
        tokenLastChars,
      });
    } else {
      this.error('Token encryption failed', {
        eventType: EventType.KMS_ERROR,
        tokenLastChars,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log token decryption event (only last 4 characters for debugging)
   */
  logTokenDecrypt(tokenLastChars: string, success: boolean, error?: Error): void {
    if (success) {
      this.debug('Token decrypted successfully', {
        eventType: EventType.TOKEN_DECRYPT,
        tokenLastChars,
      });
    } else {
      this.error('Token decryption failed', {
        eventType: EventType.KMS_ERROR,
        tokenLastChars,
        error: error?.message,
        errorDetails: error?.stack,
      });
    }
  }

  /**
   * Log authentication failure
   */
  logAuthFailure(reason: string, userId?: string): void {
    this.warn('Authentication failure', {
      userId,
      eventType: EventType.AUTH_FAILURE,
      error: reason,
    });
  }

  /**
   * Log security event - invalid state token
   */
  logInvalidState(stateToken: string, userId?: string): void {
    this.warn('Invalid state token detected - potential CSRF attack', {
      userId,
      eventType: EventType.SECURITY_INVALID_STATE,
      stateTokenPrefix: stateToken.substring(0, 8),
    });
  }

  /**
   * Log security event - expired state token
   */
  logExpiredState(stateToken: string, userId: string): void {
    this.warn('Expired state token', {
      userId,
      eventType: EventType.SECURITY_EXPIRED_STATE,
      stateTokenPrefix: stateToken.substring(0, 8),
    });
  }

  /**
   * Log security event - unauthorized access attempt
   */
  logUnauthorizedAccess(userId: string, resource: string): void {
    this.warn('Unauthorized access attempt', {
      userId,
      resource,
      eventType: EventType.SECURITY_UNAUTHORIZED_ACCESS,
    });
  }

  /**
   * Log KMS error
   */
  logKMSError(operation: string, error: Error, userId?: string): void {
    this.error(`KMS ${operation} failed`, {
      userId,
      eventType: EventType.KMS_ERROR,
      operation,
      error: error.message,
      errorDetails: error.stack,
    });
  }

  /**
   * Log DynamoDB error
   */
  logDynamoDBError(operation: string, error: Error, userId?: string): void {
    this.error(`DynamoDB ${operation} failed`, {
      userId,
      eventType: EventType.DYNAMODB_ERROR,
      operation,
      error: error.message,
      errorDetails: error.stack,
    });
  }

  /**
   * Log Google API error
   */
  logGoogleAPIError(operation: string, error: Error, userId?: string): void {
    this.error(`Google API ${operation} failed`, {
      userId,
      eventType: EventType.GOOGLE_API_ERROR,
      operation,
      error: error.message,
      errorDetails: error.stack,
    });
  }

  /**
   * Safely extract last 4 characters from a token for logging
   * Never logs the full token
   */
  static getTokenLastChars(token: string): string {
    return token.length >= 4 ? `...${token.slice(-4)}` : '...';
  }
}

/**
 * Create a logger instance with request ID from API Gateway event
 */
export function createLogger(requestId?: string): Logger {
  return new Logger(requestId);
}

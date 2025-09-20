/**
 * Base API error class that wraps HTTP errors while preserving full context
 *
 * Uses the standard Error.cause property (ES2022) to preserve the original Axios error.
 *
 * @property status - HTTP status code (e.g., 404, 500)
 * @property data - Response data from the server
 * @property cause - Original Axios error with full context including:
 *   - response: Full HTTP response with headers, status, data
 *   - request: Original HTTP request configuration
 *   - config: Axios request configuration
 *   - code: Error code (e.g., 'ECONNABORTED', 'ERR_NETWORK')
 *
 * @example
 * ```typescript
 * try {
 *   await httpClient.get('/api/resource');
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     console.log('Status:', error.status);
 *     console.log('Response headers:', error.cause?.response?.headers);
 *     console.log('Request config:', error.cause?.config);
 *   }
 * }
 * ```
 */
export class ApiError extends Error {
  // Standard Error.cause property (ES2022) - preserves original error
  public cause?: unknown;

  constructor(
    message: string,
    public readonly status?: number,
    public readonly data?: any,
    cause?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.cause = cause;

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);

    // Capture stack trace for better debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Get response headers from the original error if available
   */
  getResponseHeaders(): Record<string, string> | undefined {
    return (this.cause as any)?.response?.headers;
  }

  /**
   * Get request configuration from the original error if available
   */
  getRequestConfig(): any | undefined {
    return (this.cause as any)?.config;
  }

  /**
   * Get error code from the original error if available (e.g., 'ECONNABORTED', 'ERR_NETWORK')
   */
  getErrorCode(): string | undefined {
    return (this.cause as any)?.code;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication failed', status = 401, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'AuthenticationError';

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', status = 404, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'NotFoundError';

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', status = 400, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'BadRequestError';

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}
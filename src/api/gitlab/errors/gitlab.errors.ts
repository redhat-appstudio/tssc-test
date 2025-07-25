/**
 * Base error class for all GitLab-related errors
 */
export abstract class GitLabError extends Error {
  public readonly timestamp: Date;
  public readonly operation: string;

  constructor(message: string, operation: string) {
    super(message);
    this.name = this.constructor.name;
    this.operation = operation;
    this.timestamp = new Date();
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when GitLab API authentication fails
 */
export class GitLabAuthenticationError extends GitLabError {
  constructor(operation: string, details?: string) {
    const message = `GitLab authentication failed during ${operation}${details ? `: ${details}` : ''}`;
    super(message, operation);
  }
}

/**
 * Thrown when a requested GitLab resource is not found
 */
export class GitLabNotFoundError extends GitLabError {
  public readonly resourceType: string;
  public readonly resourceIdentifier: string | number;

  constructor(operation: string, resourceType: string, resourceIdentifier: string | number) {
    const message = `GitLab ${resourceType} '${resourceIdentifier}' not found during ${operation}`;
    super(message, operation);
    this.resourceType = resourceType;
    this.resourceIdentifier = resourceIdentifier;
  }
}

/**
 * Thrown when GitLab API rate limits are exceeded
 */
export class GitLabRateLimitError extends GitLabError {
  public readonly retryAfter?: number;

  constructor(operation: string, retryAfter?: number) {
    const message = `GitLab API rate limit exceeded during ${operation}${retryAfter ? `. Retry after ${retryAfter} seconds` : ''}`;
    super(message, operation);
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when GitLab API request validation fails
 */
export class GitLabValidationError extends GitLabError {
  public readonly validationErrors: string[];

  constructor(operation: string, validationErrors: string[]) {
    const message = `GitLab API validation failed during ${operation}: ${validationErrors.join(', ')}`;
    super(message, operation);
    this.validationErrors = validationErrors;
  }
}

/**
 * Thrown when GitLab API request times out
 */
export class GitLabTimeoutError extends GitLabError {
  public readonly timeout: number;

  constructor(operation: string, timeout: number) {
    const message = `GitLab API request timed out after ${timeout}ms during ${operation}`;
    super(message, operation);
    this.timeout = timeout;
  }
}

/**
 * Thrown when GitLab API returns an unexpected status code
 */
export class GitLabApiError extends GitLabError {
  public readonly statusCode: number;
  public readonly response?: any;

  constructor(operation: string, statusCode: number, response?: any) {
    const message = `GitLab API error (${statusCode}) during ${operation}`;
    super(message, operation);
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Thrown when GitLab configuration is invalid
 */
export class GitLabConfigurationError extends GitLabError {
  public readonly configField: string;

  constructor(configField: string, details: string) {
    const message = `GitLab configuration error for '${configField}': ${details}`;
    super(message, 'configuration');
    this.configField = configField;
  }
}

/**
 * Utility function to create appropriate GitLab error from API response
 */
export function createGitLabErrorFromResponse(
  operation: string,
  error: any,
  resourceType?: string,
  resourceIdentifier?: string | number
): GitLabError {
  // Handle different types of errors from the GitLab API
  if (error?.response?.status === 401) {
    return new GitLabAuthenticationError(operation, error.message);
  }
  
  if (error?.response?.status === 404) {
    return new GitLabNotFoundError(
      operation,
      resourceType || 'resource',
      resourceIdentifier || 'unknown'
    );
  }
  
  if (error?.response?.status === 429) {
    const retryAfter = error.response.headers?.['retry-after'];
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
    // Keep validation to prevent NaN/negative values
    const validRetryAfter = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : undefined;
    return new GitLabRateLimitError(operation, validRetryAfter);
  }
  
  if (error?.response?.status === 422) {
    // Use your simpler, cleaner approach
    let validationErrors: string[] = [];
    const errorData = error.response?.data?.message;
    
    if (Array.isArray(errorData)) {
      validationErrors = errorData.map(e => String(e));
    } else if (errorData) {
      validationErrors = [String(errorData)];
    } else {
      validationErrors = [error.message || 'Unknown validation error'];
    }
    
    return new GitLabValidationError(operation, validationErrors);
  }
  
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return new GitLabTimeoutError(operation, error.timeout || 30000);
  }
  
  if (error?.response?.status) {
    return new GitLabApiError(operation, error.response.status, error.response.data);
  }
  
  // Fallback to generic GitLab error
  return new class extends GitLabError {
    constructor() {
      super(error?.message || 'Unknown GitLab error', operation);
    }
  }();
} 
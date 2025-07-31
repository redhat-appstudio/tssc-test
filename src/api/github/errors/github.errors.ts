/**
 * Base GitHub error class
 */
export class GithubError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'GithubError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GithubError);
    }
  }
}

/**
 * Error thrown when a GitHub resource is not found (e.g., repository, workflow run)
 */
export class GithubNotFoundError extends GithubError {
  constructor(resource: string, identifier: string, statusCode: number = 404) {
    super(`GitHub ${resource} not found: ${identifier}`, statusCode);
    this.name = 'GithubNotFoundError';
  }
}

/**
 * Error thrown when GitHub authentication fails
 */
export class GithubAuthenticationError extends GithubError {
  constructor(message: string = 'GitHub authentication failed', statusCode: number = 401) {
    super(message, statusCode);
    this.name = 'GithubAuthenticationError';
  }
}

/**
 * Error thrown when GitHub API rate limit is exceeded
 */
export class GithubRateLimitError extends GithubError {
  constructor(retryAfter?: number, statusCode: number = 429) {
    const message = retryAfter 
      ? `GitHub API rate limit exceeded. Retry after ${retryAfter} seconds.`
      : 'GitHub API rate limit exceeded.';
    super(message, statusCode);
    this.name = 'GithubRateLimitError';
  }
}

/**
 * Error thrown when a GitHub API request fails for other reasons
 */
export class GithubApiError extends GithubError {
  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message, statusCode, cause);
    this.name = 'GithubApiError';
  }
}
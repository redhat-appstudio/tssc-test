import { ApiError } from '../../common/errors/api.errors';

/**
 * Base Jenkins error class extending ApiError
 *
 * Provides Jenkins-specific error handling with HTTP status codes
 * and error context preservation through the error chain.
 *
 * @extends ApiError
 */
export class JenkinsError extends ApiError {
  constructor(
    message: string,
    status?: number,
    cause?: unknown
  ) {
    super(message, status, undefined, cause);
    this.name = 'JenkinsError';

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, JenkinsError.prototype);
  }
}

/**
 * Error thrown when a Jenkins job is not found
 */
export class JenkinsJobNotFoundError extends JenkinsError {
  constructor(jobName: string, folderName?: string) {
    const path = folderName ? `${folderName}/${jobName}` : jobName;
    super(`Jenkins job not found: ${path}`, 404);
    this.name = 'JenkinsJobNotFoundError';
    Object.setPrototypeOf(this, JenkinsJobNotFoundError.prototype);
  }
}

/**
 * Error thrown when a Jenkins build times out
 */
export class JenkinsBuildTimeoutError extends JenkinsError {
  constructor(jobName: string, buildNumber: number, timeoutMs: number) {
    super(`Build #${buildNumber} for job ${jobName} did not complete within ${timeoutMs}ms`);
    this.name = 'JenkinsBuildTimeoutError';
    Object.setPrototypeOf(this, JenkinsBuildTimeoutError.prototype);
  }
}

/**
 * Error thrown when Jenkins build is not found
 */
export class JenkinsBuildNotFoundError extends JenkinsError {
  constructor(jobName: string, buildNumber: number, folderName?: string) {
    const path = folderName ? `${folderName}/${jobName}` : jobName;
    super(`Build #${buildNumber} not found for job: ${path}`, 404);
    this.name = 'JenkinsBuildNotFoundError';
    Object.setPrototypeOf(this, JenkinsBuildNotFoundError.prototype);
  }
}

/**
 * Error thrown when Jenkins credentials creation fails
 */
export class JenkinsCredentialError extends JenkinsError {
  constructor(credentialId: string, message: string, status?: number) {
    super(`Failed to manage credential '${credentialId}': ${message}`, status);
    this.name = 'JenkinsCredentialError';
    Object.setPrototypeOf(this, JenkinsCredentialError.prototype);
  }
}

/**
 * Error thrown when Jenkins folder operations fail
 */
export class JenkinsFolderError extends JenkinsError {
  constructor(folderName: string, operation: string, message: string, status?: number) {
    super(`Failed to ${operation} folder '${folderName}': ${message}`, status);
    this.name = 'JenkinsFolderError';
    Object.setPrototypeOf(this, JenkinsFolderError.prototype);
  }
}

/**
 * Error thrown when Jenkins authentication fails
 */
export class JenkinsAuthenticationError extends JenkinsError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'JenkinsAuthenticationError';
    Object.setPrototypeOf(this, JenkinsAuthenticationError.prototype);
  }
}

/**
 * Error thrown when Jenkins API rate limit is exceeded
 */
export class JenkinsRateLimitError extends JenkinsError {
  constructor(retryAfter?: number) {
    const message = retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds.`
      : 'Rate limit exceeded.';
    super(message, 429);
    this.name = 'JenkinsRateLimitError';
    Object.setPrototypeOf(this, JenkinsRateLimitError.prototype);
  }
} 
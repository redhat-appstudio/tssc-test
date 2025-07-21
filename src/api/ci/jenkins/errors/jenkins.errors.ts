/**
 * Base Jenkins error class
 */
export class JenkinsError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'JenkinsError';
    
    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JenkinsError);
    }
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
  }
}

/**
 * Error thrown when a Jenkins build times out
 */
export class JenkinsBuildTimeoutError extends JenkinsError {
  constructor(jobName: string, buildNumber: number, timeoutMs: number) {
    super(`Build #${buildNumber} for job ${jobName} did not complete within ${timeoutMs}ms`);
    this.name = 'JenkinsBuildTimeoutError';
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
  }
}

/**
 * Error thrown when Jenkins credentials creation fails
 */
export class JenkinsCredentialError extends JenkinsError {
  constructor(credentialId: string, message: string, statusCode?: number) {
    super(`Failed to manage credential '${credentialId}': ${message}`, statusCode);
    this.name = 'JenkinsCredentialError';
  }
}

/**
 * Error thrown when Jenkins folder operations fail
 */
export class JenkinsFolderError extends JenkinsError {
  constructor(folderName: string, operation: string, message: string, statusCode?: number) {
    super(`Failed to ${operation} folder '${folderName}': ${message}`, statusCode);
    this.name = 'JenkinsFolderError';
  }
}

/**
 * Error thrown when Jenkins authentication fails
 */
export class JenkinsAuthenticationError extends JenkinsError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'JenkinsAuthenticationError';
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
  }
} 
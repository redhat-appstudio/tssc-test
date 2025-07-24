/**
 * Base ArgoCD error class
 */
export abstract class ArgoCDError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error thrown when ArgoCD connection fails
 */
export class ArgoCDConnectionError extends ArgoCDError {
  constructor(message: string, cause?: Error) {
    super(message, 'ARGOCD_CONNECTION_ERROR', cause);
  }
}

/**
 * Error thrown when ArgoCD application is not found
 */
export class ArgoCDApplicationNotFoundError extends ArgoCDError {
  constructor(applicationName: string, namespace: string, cause?: Error) {
    super(
      `ArgoCD application '${applicationName}' not found in namespace '${namespace}'`,
      'ARGOCD_APPLICATION_NOT_FOUND',
      cause
    );
  }
}

/**
 * Error thrown when ArgoCD application sync fails
 */
export class ArgoCDSyncError extends ArgoCDError {
  constructor(applicationName: string, message: string, cause?: Error) {
    super(
      `Failed to sync ArgoCD application '${applicationName}': ${message}`,
      'ARGOCD_SYNC_ERROR',
      cause
    );
  }
}

/**
 * Error thrown when ArgoCD operation times out
 */
export class ArgoCDTimeoutError extends ArgoCDError {
  constructor(operation: string, timeoutMs: number, cause?: Error) {
    super(
      `ArgoCD operation '${operation}' timed out after ${timeoutMs}ms`,
      'ARGOCD_TIMEOUT_ERROR',
      cause
    );
  }
}

/**
 * Error thrown when ArgoCD CLI command fails
 */
export class ArgoCDCliError extends ArgoCDError {
  constructor(command: string, exitCode: number, stderr: string, cause?: Error) {
    super(
      `ArgoCD CLI command '${command}' failed with exit code ${exitCode}: ${stderr}`,
      'ARGOCD_CLI_ERROR',
      cause
    );
  }
}

/**
 * Error thrown when ArgoCD instance is not found
 */
export class ArgoCDInstanceNotFoundError extends ArgoCDError {
  constructor(namespace: string, cause?: Error) {
    super(
      `ArgoCD instance not found in namespace '${namespace}'`,
      'ARGOCD_INSTANCE_NOT_FOUND',
      cause
    );
  }
} 
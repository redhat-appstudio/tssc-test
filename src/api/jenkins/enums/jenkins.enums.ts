/**
 * Jenkins build result status enum
 */
export enum JenkinsBuildResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  UNSTABLE = 'UNSTABLE',
  ABORTED = 'ABORTED',
  NOT_BUILT = 'NOT_BUILT',
}

/**
 * Jenkins build trigger type enum
 */
export enum JenkinsBuildTrigger {
  UNKNOWN = 'UNKNOWN',
  PULL_REQUEST = 'PULL_REQUEST',
  PUSH = 'PUSH',
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
  API = 'API',
}

/**
 * Jenkins credential types
 */
export enum CredentialType {
  SECRET_TEXT = 'Secret text',
  USERNAME_PASSWORD = 'Username with password',
  SSH_USERNAME_PRIVATE_KEY = 'SSH Username with private key',//TODO: need to confirm if this is correct
} 
/**
 * Jenkins configuration constants and default values
 */
export class JenkinsConfig {
  public static readonly DEFAULT_BRANCH = 'main';
  public static readonly DEFAULT_JENKINSFILE_PATH = 'Jenkinsfile';
  public static readonly DEFAULT_CREDENTIAL_ID = 'GITOPS_AUTH_PASSWORD';
  public static readonly DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  public static readonly DEFAULT_POLL_INTERVAL_MS = 5000; // 5 seconds
  public static readonly DEFAULT_MAX_BUILDS_TO_CHECK = 50;
  
  /**
   * HTTP headers for different content types
   */
  public static readonly HEADERS = {
    XML: { 'Content-Type': 'application/xml' },
    JSON: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    PLAIN: { 'Accept': 'text/plain' },
  } as const;

  /**
   * Jenkins plugin information
   */
  public static readonly PLUGINS = {
    WORKFLOW_JOB: 'workflow-job@2.40',
    GITHUB: 'github@1.37.1',
    WORKFLOW_CPS: 'workflow-cps@2.89',
    GIT: 'git@4.4.5',
    PLAIN_CREDENTIALS: 'plain-credentials',
  } as const;

  /**
   * Jenkins API endpoints
   */
  public static readonly ENDPOINTS = {
    CREATE_ITEM: 'createItem',
    API_JSON: 'api/json',
    BUILD: 'build',
    BUILD_WITH_PARAMETERS: 'buildWithParameters',
    LOG_TEXT: 'logText/progressiveText',
    CREDENTIALS_STORE_SYSTEM: 'credentials/store/system/domain/_/createCredentials',
    CREDENTIALS_STORE_FOLDER: 'credentials/store/folder/domain/_/createCredentials',
  } as const;
} 
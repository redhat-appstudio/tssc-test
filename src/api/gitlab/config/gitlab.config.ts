export interface GitLabConfig {
  /**
   * GitLab instance URL (e.g., 'https://gitlab.com' or 'https://gitlab.example.com')
   */
  readonly baseUrl: string;
  
  /**
   * Personal access token for authentication
   */
  readonly token: string;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  readonly timeout?: number;
  
  /**
   * Enable SSL verification
   * @default true
   */
  readonly sslVerify?: boolean;
  
  /**
   * Maximum number of retries for failed requests
   * @default 3
   */
  readonly maxRetries?: number;
  
  /**
   * Minimum timeout between retries in milliseconds
   * @default 1000
   */
  readonly retryMinTimeout?: number;
  
  /**
   * Maximum timeout between retries in milliseconds
   * @default 5000
   */
  readonly retryMaxTimeout?: number;
}

interface MutableGitLabConfig {
  baseUrl?: string;
  token?: string;
  timeout?: number;
  sslVerify?: boolean;
  maxRetries?: number;
  retryMinTimeout?: number;
  retryMaxTimeout?: number;
}

export class GitLabConfigBuilder {
  private config: MutableGitLabConfig = {};

  constructor(baseUrl?: string, token?: string) {
    if (baseUrl) this.config.baseUrl = baseUrl;
    if (token) this.config.token = token;
  }

  public setBaseUrl(baseUrl: string): GitLabConfigBuilder {
    this.config.baseUrl = baseUrl;
    return this;
  }

  public setToken(token: string): GitLabConfigBuilder {
    this.config.token = token;
    return this;
  }

  public setTimeout(timeout: number): GitLabConfigBuilder {
    this.config.timeout = timeout;
    return this;
  }

  public setSSLVerify(sslVerify: boolean): GitLabConfigBuilder {
    this.config.sslVerify = sslVerify;
    return this;
  }

  public setRetryOptions(maxRetries: number, minTimeout: number, maxTimeout: number): GitLabConfigBuilder {
    this.config.maxRetries = maxRetries;
    this.config.retryMinTimeout = minTimeout;
    this.config.retryMaxTimeout = maxTimeout;
    return this;
  }

  public build(): GitLabConfig {
    if (!this.config.baseUrl) {
      throw new Error('GitLab base URL is required');
    }
    if (!this.config.token) {
      throw new Error('GitLab token is required');
    }

    return {
      baseUrl: this.config.baseUrl,
      token: this.config.token,
      timeout: this.config.timeout ?? 30000,
      sslVerify: this.config.sslVerify ?? true,
      maxRetries: this.config.maxRetries ?? 3,
      retryMinTimeout: this.config.retryMinTimeout ?? 1000,
      retryMaxTimeout: this.config.retryMaxTimeout ?? 5000,
    };
  }

  public static create(baseUrl?: string, token?: string): GitLabConfigBuilder {
    return new GitLabConfigBuilder(baseUrl, token);
  }
} 
import { sleep } from '../../utils/util';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * Rate limit information returned by the Bitbucket API
 */
interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}

/**
 * BitbucketClient class for interacting with the Bitbucket API
 */
export class BitbucketClient {
  private client: AxiosInstance;
  private baseUrl: string = 'https://api.bitbucket.org/2.0';
  private rateLimitInfo: RateLimitInfo = { remaining: -1, resetTime: 0, limit: -1 };
  private readonly maxRetries: number = 5;
  private readonly initialRetryDelayMs: number = 1000;

  /**
   * Constructor for the BitbucketClient
   * @param options Configuration options for the client
   */
  constructor(
    options: {
      username?: string;
      appPassword?: string;
      accessToken?: string;
      baseUrl?: string;
    } = {}
  ) {
    if (options.baseUrl) {
      this.baseUrl = options.baseUrl;
    }

    const config: AxiosRequestConfig = {
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Set authentication
    if (options.accessToken) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${options.accessToken}`,
      };
    } else if (options.username && options.appPassword) {
      const credentials = Buffer.from(`${options.username}:${options.appPassword}`).toString(
        'base64'
      );
      config.headers = {
        ...config.headers,
        Authorization: `Basic ${credentials}`,
      };
    }

    this.client = axios.create(config);
  }

  /**
   * Update rate limit information from the response headers
   * @param response Axios response object
   */
  private updateRateLimitInfo(response?: AxiosResponse): void {
    if (!response || !response.headers) return;

    // Bitbucket uses different headers than GitHub for rate limiting
    const remaining = response.headers['x-ratelimit-remaining'];
    const resetTime = response.headers['x-ratelimit-reset'];
    const limit = response.headers['x-ratelimit-limit'];

    if (remaining !== undefined) {
      this.rateLimitInfo.remaining = parseInt(remaining, 10);
    }

    if (resetTime !== undefined) {
      // Check if it's a timestamp or seconds value
      this.rateLimitInfo.resetTime = resetTime.includes(':')
        ? new Date(resetTime).getTime()
        : Date.now() + parseInt(resetTime, 10) * 1000;
    }

    if (limit !== undefined) {
      this.rateLimitInfo.limit = parseInt(limit, 10);
    }

    // Log rate limit info when it's running low (less than 10% remaining)
    if (
      this.rateLimitInfo.remaining > 0 &&
      this.rateLimitInfo.limit > 0 &&
      this.rateLimitInfo.remaining / this.rateLimitInfo.limit < 0.1
    ) {
      console.warn(
        `Bitbucket API rate limit warning: ${this.rateLimitInfo.remaining}/${this.rateLimitInfo.limit} ` +
          `requests remaining. Resets in ${Math.round((this.rateLimitInfo.resetTime - Date.now()) / 1000)} seconds.`
      );
    }
  }

  /**
   * Handle API errors
   * @param error The error object
   * @param isRetryable Whether the operation that caused this error should be retried
   * @returns The error to be thrown, or null if the error was handled and a retry should be attempted
   */
  private handleApiError(error: any, isRetryable: boolean = false): Error {
    if (error.response) {
      // Update rate limit info if headers are available
      this.updateRateLimitInfo(error.response);

      // Handle rate limiting (429 Too Many Requests)
      if (error.response.status === 429 && isRetryable) {
        const retryAfterHeader = error.response.headers['retry-after'];
        const waitTime = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : this.initialRetryDelayMs;
        console.log(
          `Rate limit exceeded. Waiting for ${waitTime / 1000} seconds before retrying...`
        );

        return new Error(`RATE_LIMIT_EXCEEDED:${waitTime}`);
      }

      return new Error(
        `Bitbucket API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      return new Error('Bitbucket API Error: No response received from the server');
    } else {
      return new Error(`Bitbucket API Error: ${error.message}`);
    }
  }

  // Rate limit info methods merged into a single implementation above

  /**
   * Perform a request with retry capabilities for rate-limiting
   * @param method HTTP method to use
   * @param endpoint API endpoint
   * @param data Request body for POST/PUT requests
   * @param config Additional Axios configuration
   * @returns API response data
   */
  private async requestWithRetry(
    method: 'get' | 'post' | 'put' | 'delete',
    endpoint: string,
    data?: any,
    config: AxiosRequestConfig = {}
  ): Promise<any> {
    let attempts = 0;
    let lastError: Error | null = null;
    let delay = this.initialRetryDelayMs;

    while (attempts <= this.maxRetries) {
      try {
        let response: AxiosResponse;

        switch (method) {
          case 'get':
            response = await this.client.get(endpoint, config);
            break;
          case 'post':
            response = await this.client.post(endpoint, data, config);
            break;
          case 'put':
            response = await this.client.put(endpoint, data, config);
            break;
          case 'delete':
            response = await this.client.delete(endpoint, config);
            break;
        }

        // Update rate limit info from successful response
        this.updateRateLimitInfo(response);

        return response.data;
      } catch (error: any) {
        lastError = this.handleApiError(error, true);

        // If we hit rate limiting, parse the wait time from the error message
        if (lastError.message.startsWith('RATE_LIMIT_EXCEEDED:')) {
          const waitTime = parseInt(lastError.message.split(':')[1], 10);
          console.log(
            `Rate limit hit, waiting for ${waitTime / 1000}s before retry ${attempts + 1}/${this.maxRetries}`
          );
          await sleep(waitTime);
          attempts++;
        } else {
          // For other errors, use exponential backoff
          if (attempts < this.maxRetries) {
            console.log(
              `Request failed, retrying in ${delay / 1000}s (${attempts + 1}/${this.maxRetries})`
            );
            await sleep(delay);
            delay *= 2; // Exponential backoff
            attempts++;
          } else {
            // Max retries reached, throw the last error
            throw lastError;
          }
        }
      }
    }

    // This should not be reached due to the throw in the catch block,
    // but just in case, throw the last error if it exists
    if (lastError) {
      throw lastError;
    }

    // Fallback error if somehow we get here without an error
    throw new Error('Maximum retry attempts reached');
  }

  /**
   * Perform a custom GET request to the Bitbucket API
   * @param endpoint API endpoint
   * @param params Query parameters
   * @returns Response data
   */
  async get(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    return this.requestWithRetry('get', endpoint, undefined, { params });
  }

  /**
   * Perform a custom POST request to the Bitbucket API
   * @param endpoint API endpoint
   * @param data Request body
   * @param config Additional configuration
   * @returns Response data
   */
  async post(endpoint: string, data: any, config: AxiosRequestConfig = {}): Promise<any> {
    return this.requestWithRetry('post', endpoint, data, config);
  }

  /**
   * Perform a custom PUT request to the Bitbucket API
   * @param endpoint API endpoint
   * @param data Request body
   * @param config Additional configuration
   * @returns Response data
   */
  async put(endpoint: string, data: any, config: AxiosRequestConfig = {}): Promise<any> {
    return this.requestWithRetry('put', endpoint, data, config);
  }

  /**
   * Perform a custom DELETE request to the Bitbucket API
   * @param endpoint API endpoint
   * @param config Additional configuration
   * @returns Response data
   */
  async delete(endpoint: string, config: AxiosRequestConfig = {}): Promise<any> {
    return this.requestWithRetry('delete', endpoint, undefined, config);
  }

  /**
   * Get user profile information
   * @returns User profile data
   */
  async getUserProfile(): Promise<any> {
    return this.requestWithRetry('get', '/user');
  }

  /**
   * Get repositories for the authenticated user
   * @param workspace The workspace ID (Optional)
   * @param params Additional query parameters
   * @returns List of repositories
   */
  async getRepositories(workspace?: string, params: Record<string, any> = {}): Promise<any> {
    const endpoint = workspace ? `/repositories/${workspace}` : '/repositories';
    return this.requestWithRetry('get', endpoint, undefined, { params });
  }

  /**
   * Get a specific repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @returns Repository data
   */
  async getRepository(workspace: string, repoSlug: string): Promise<any> {
    return this.requestWithRetry('get', `/repositories/${workspace}/${repoSlug}`);
  }

  /**
   * Get branches for a repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param params Additional query parameters
   * @returns List of branches
   */
  async getBranches(
    workspace: string,
    repoSlug: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    return this.requestWithRetry(
      'get',
      `/repositories/${workspace}/${repoSlug}/refs/branches`,
      undefined,
      { params }
    );
  }

  /**
   * Get pull requests for a repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param params Additional query parameters
   * @returns List of pull requests
   */
  async getPullRequests(
    workspace: string,
    repoSlug: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    return this.requestWithRetry(
      'get',
      `/repositories/${workspace}/${repoSlug}/pullrequests`,
      undefined,
      { params }
    );
  }

  /**
   * Create a pull request
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param data Pull request data
   * @returns Created pull request data
   */
  async createPullRequest(
    workspace: string,
    repoSlug: string,
    data: {
      title: string;
      source: { branch: { name: string } };
      destination: { branch: { name: string } };
      description?: string;
      close_source_branch?: boolean;
      reviewers?: Array<{ uuid: string }>;
    }
  ): Promise<any> {
    return this.requestWithRetry(
      'post',
      `/repositories/${workspace}/${repoSlug}/pullrequests`,
      data
    );
  }

  /**
   * Get commits for a repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param params Additional query parameters
   * @returns List of commits
   */
  async getCommits(
    workspace: string,
    repoSlug: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    return this.requestWithRetry(
      'get',
      `/repositories/${workspace}/${repoSlug}/commits`,
      undefined,
      { params }
    );
  }

  /**
   * Get file content from a repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param filePath Path to the file
   * @param ref Reference (branch, tag, or commit)
   * @returns File content
   */
  async getFileContent(
    workspace: string,
    repoSlug: string,
    filePath: string,
    ref: string = 'master'
  ): Promise<any> {
    return this.requestWithRetry(
      'get',
      `/repositories/${workspace}/${repoSlug}/src/${ref}/${filePath}`
    );
  }

  /**
   * Configure a webhook for a repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param webhookUrl The URL to send webhook events to
   * @param events Array of event types to trigger the webhook
   * @param description Description of the webhook (optional)
   * @param skip_cert_verification Whether to skip SSL certificate verification (default: true)
   * @param secret_set The secret string to use for webhook security (optional)
   * @returns Created webhook data
   */
  async configWebhook(
    workspace: string,
    repoSlug: string,
    webhookUrl: string,
    events: string[] = [
      'repo:push',
      'pullrequest:created',
      'pullrequest:updated',
      'pullrequest:fulfilled',
    ],
    description: string = 'Webhook configured by RHTAP',
    skip_cert_verification: boolean = true,
    secret_set?: string
  ): Promise<any> {
    if (!workspace || !repoSlug || !webhookUrl) {
      throw new Error('Workspace, repository slug, and webhook URL are required');
    }

    const webhookData: any = {
      description,
      url: webhookUrl,
      active: true,
      events,
      skip_cert_verification,
    };

    // Add secret if provided
    if (secret_set) {
      webhookData.secret = secret_set;
    }

    const endpoint = `/repositories/${workspace}/${repoSlug}/hooks`;
    return this.requestWithRetry('post', endpoint, webhookData);
  }

  /**
   * Merge a pull request
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @param pullRequestId The pull request ID
   * @param options Additional merge options (optional)
   * @returns Merged pull request data
   */
  async mergePullRequest(
    workspace: string,
    repoSlug: string,
    pullRequestId: number,
    options: {
      message?: string;
      close_source_branch?: boolean;
      merge_strategy?: 'merge_commit' | 'squash' | 'fast-forward';
    } = {}
  ): Promise<{ hash: string; message: string }> {
    const endpoint = `/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/merge`;
    const response = await this.requestWithRetry('post', endpoint, options);

    if (!response.merge_commit) {
      throw new Error(`Merge operation didn't return a commit hash for PR #${pullRequestId}`);
    }

    return {
      hash: response.merge_commit.hash,
      message: response.message || `Pull request #${pullRequestId} merged successfully`,
    };
  }
}

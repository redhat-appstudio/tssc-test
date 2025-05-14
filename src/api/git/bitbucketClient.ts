import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * BitbucketClient class for interacting with the Bitbucket API
 */
export class BitbucketClient {
  private client: AxiosInstance;
  private baseUrl: string = 'https://api.bitbucket.org/2.0';

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
   * Get user profile information
   * @returns User profile data
   */
  async getUserProfile(): Promise<any> {
    try {
      const response = await this.client.get('/user');
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get repositories for the authenticated user
   * @param workspace The workspace ID (Optional)
   * @param params Additional query parameters
   * @returns List of repositories
   */
  async getRepositories(workspace?: string, params: Record<string, any> = {}): Promise<any> {
    try {
      const endpoint = workspace ? `/repositories/${workspace}` : '/repositories';
      const response = await this.client.get(endpoint, { params });
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get a specific repository
   * @param workspace The workspace ID
   * @param repoSlug The repository slug
   * @returns Repository data
   */
  async getRepository(workspace: string, repoSlug: string): Promise<any> {
    try {
      const response = await this.client.get(`/repositories/${workspace}/${repoSlug}`);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    try {
      const response = await this.client.get(
        `/repositories/${workspace}/${repoSlug}/refs/branches`,
        { params }
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    try {
      const response = await this.client.get(
        `/repositories/${workspace}/${repoSlug}/pullrequests`,
        { params }
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    try {
      const response = await this.client.post(
        `/repositories/${workspace}/${repoSlug}/pullrequests`,
        data
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    try {
      const response = await this.client.get(`/repositories/${workspace}/${repoSlug}/commits`, {
        params,
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    try {
      const response = await this.client.get(
        `/repositories/${workspace}/${repoSlug}/src/${ref}/${filePath}`
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    events: string[] = ['repo:push', 'pullrequest:created', 'pullrequest:updated', 'pullrequest:fulfilled'],
    description: string = 'Webhook configured by RHTAP',
    skip_cert_verification: boolean = true,
    secret_set?: string
  ): Promise<any> {
    try {
      if (!workspace || !repoSlug || !webhookUrl) {
        throw new Error('Workspace, repository slug, and webhook URL are required');
      }

      const webhookData: any = {
        description,
        url: webhookUrl,
        active: true,
        events,
        skip_cert_verification
      };

      // Add secret if provided
      if (secret_set) {
        webhookData.secret = secret_set;
      }

      const endpoint = `/repositories/${workspace}/${repoSlug}/hooks`;
      const response = await this.client.post(endpoint, webhookData);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
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
    try {
      const endpoint = `/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/merge`;
      const response = await this.client.post(endpoint, options);
      
      if (!response.data || !response.data.merge_commit) {
        throw new Error(`Merge operation didn't return a commit hash for PR #${pullRequestId}`);
      }
      
      return {
        hash: response.data.merge_commit.hash,
        message: response.data.message || `Pull request #${pullRequestId} merged successfully`,
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Handle API errors
   * @param error The error object
   */
  private handleApiError(error: any): never {
    if (error.response) {
      throw new Error(
        `Bitbucket API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      throw new Error('Bitbucket API Error: No response received from the server');
    } else {
      throw new Error(`Bitbucket API Error: ${error.message}`);
    }
  }

  /**
   * Perform a custom GET request to the Bitbucket API
   * @param endpoint API endpoint
   * @param params Query parameters
   * @returns Response data
   */
  async get(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await this.client.get(endpoint, { params });
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Perform a custom POST request to the Bitbucket API
   * @param endpoint API endpoint
   * @param data Request body
   * @param config Additional configuration
   * @returns Response data
   */
  async post(endpoint: string, data: any, config: AxiosRequestConfig = {}): Promise<any> {
    try {
      const response = await this.client.post(endpoint, data, config);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Perform a custom PUT request to the Bitbucket API
   * @param endpoint API endpoint
   * @param data Request body
   * @param config Additional configuration
   * @returns Response data
   */
  async put(endpoint: string, data: any, config: AxiosRequestConfig = {}): Promise<any> {
    try {
      const response = await this.client.put(endpoint, data, config);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Perform a custom DELETE request to the Bitbucket API
   * @param endpoint API endpoint
   * @param config Additional configuration
   * @returns Response data
   */
  async delete(endpoint: string, config: AxiosRequestConfig = {}): Promise<any> {
    try {
      const response = await this.client.delete(endpoint, config);
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }
}

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

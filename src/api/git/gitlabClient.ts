import axios, { AxiosInstance } from 'axios';

/**
 * Interface definitions for GitLab API responses
 */
export interface GitLabProject {
  id: number;
  name: string;
  description: string;
  web_url: string;
  default_branch: string;
  visibility: string;
  namespace: {
    id: number;
    name: string;
    path: string;
  };
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  created_at: string;
}

export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  web_url: string;
}

export interface GitLabRepository {
  root_ref: string;
  empty: boolean;
  size: number;
}

/**
 * GitLab API client class
 */
export class GitLabClient {
  private client: AxiosInstance;
  private baseUrl: string;

  /**
   * Create a new GitLab client
   * @param baseUrl The base URL of the GitLab instance
   * @param token Personal access token for authentication
   */
  constructor(
    baseUrl: string,
    private token: string
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => this.handleRequestError(error)
    );
  }

  /**
   * Handle request errors
   */
  private handleRequestError(error: any): Promise<never> {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401) {
        return Promise.reject(new Error('Unauthorized: Invalid token'));
      } else if (status === 403) {
        return Promise.reject(new Error('Forbidden: Insufficient permissions'));
      } else if (status === 404) {
        return Promise.reject(new Error('Not found: Resource does not exist'));
      } else {
        return Promise.reject(new Error(`GitLab API error (${status}): ${JSON.stringify(data)}`));
      }
    } else if (error.request) {
      // The request was made but no response was received
      return Promise.reject(new Error('No response received from GitLab API'));
    } else {
      // Something happened in setting up the request
      return Promise.reject(new Error(`Error setting up request: ${error.message}`));
    }
  }

  /**
   * Get all projects
   */
  async getProjects(
    params: { owned?: boolean; membership?: boolean; search?: string } = {}
  ): Promise<GitLabProject[]> {
    const response = await this.client.get('api/v4/projects', { params });
    return response.data;
  }

  /**
   * Get a specific project
   */
  async getProject(projectId: number | string): Promise<GitLabProject> {
    const response = await this.client.get(`api/v4/projects/${encodeURIComponent(projectId)}`);
    return response.data;
  }

  /**
   * Get project repository
   */
  async getRepository(projectId: number | string): Promise<GitLabRepository> {
    const response = await this.client.get(
      `api/v4/projects/${encodeURIComponent(projectId)}/repository`
    );
    return response.data;
  }

  /**
   * Get branches in a project
   */
  async getBranches(projectId: number | string): Promise<GitLabBranch[]> {
    const response = await this.client.get(
      `api/v4/projects/${encodeURIComponent(projectId)}/repository/branches`
    );
    return response.data;
  }

  /**
   * Get a specific branch in a project
   */
  async getBranch(projectId: number | string, branch: string): Promise<GitLabBranch> {
    const response = await this.client.get(
      `api/v4/projects/${encodeURIComponent(projectId)}/repository/branches/${encodeURIComponent(branch)}`
    );
    return response.data;
  }

  /**
   * Get commits in a project
   */
  async getCommits(
    projectId: number | string,
    params: { ref_name?: string; path?: string; since?: string; until?: string } = {}
  ): Promise<GitLabCommit[]> {
    const response = await this.client.get(
      `api/v4/projects/${encodeURIComponent(projectId)}/repository/commits`,
      {
        params,
      }
    );
    return response.data;
  }

  /**
   * Get merge requests
   */
  async getMergeRequests(
    projectId: number | string,
    params: {
      state?: 'opened' | 'closed' | 'merged' | 'all';
      scope?: 'created_by_me' | 'assigned_to_me';
    } = {}
  ): Promise<GitLabMergeRequest[]> {
    const response = await this.client.get(
      `api/v4/projects/${encodeURIComponent(projectId)}/merge_requests`,
      {
        params,
      }
    );
    return response.data;
  }

  /**
   * Create a merge request
   */
  async createMergeRequest(
    projectId: number | string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    options: { description?: string; removeSourceBranch?: boolean } = {}
  ): Promise<GitLabMergeRequest> {
    const response = await this.client.post(
      `api/v4/projects/${encodeURIComponent(projectId)}/merge_requests`,
      {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description: options.description || '',
        remove_source_branch: options.removeSourceBranch || false,
      }
    );
    return response.data;
  }

  /**
   * Create a file in the repository
   */
  async createFile(
    projectId: number | string,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<any> {
    const response = await this.client.post(
      `api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}`,
      {
        branch,
        content,
        commit_message: commitMessage,
      }
    );
    return response.data;
  }

  /**
   * Update a file in the repository
   */
  async updateFile(
    projectId: number | string,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<any> {
    const response = await this.client.put(
      `api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}`,
      {
        branch,
        content,
        commit_message: commitMessage,
      }
    );
    return response.data;
  }
}

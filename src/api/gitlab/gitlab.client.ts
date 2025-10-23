import { Gitlab } from '@gitbeaker/rest';
import { GitLabConfig } from './config/gitlab.config';
import { GitLabProjectService } from './services/gitlab-project.service';
import { GitLabRepositoryService } from './services/gitlab-repository.service';
import { GitLabMergeRequestService } from './services/gitlab-merge-request.service';
import { GitLabWebhookService } from './services/gitlab-webhook.service';
import { GitLabPipelineService } from './services/gitlab-pipeline.service';
import { BaseApiClient } from '../common/base-api.client';

/**
 * GitLab API Client
 * 
 * A comprehensive client for interacting with GitLab's REST API. This client provides
 * a service-oriented architecture with dedicated services for different GitLab operations.
 * It uses the Gitbeaker library under the hood for GitLab API interactions.
 * 
 * @example Basic Usage
 * ```typescript
 * import { GitLabClient } from './api/gitlab';
 * 
 * const client = new GitLabClient({
 *   token: 'glpat_your_token_here',
 *   baseUrl: 'https://gitlab.example.com', // Your GitLab instance URL
 *   timeout: 60000 // Optional, defaults to 60 seconds
 * });
 * 
 * // Check connectivity
 * const isConnected = await client.ping();
 * const version = await client.getVersion();
 * 
 * // Access different services
 * const projects = await client.projects.getProjects();
 * const mergeRequests = await client.mergeRequests.listMergeRequests('group/project');
 * ```
 * 
 * @example Service-Oriented Usage
 * ```typescript
 * // Project operations
 * const project = await client.projects.getProject('group/project');
 * await client.projects.setEnvironmentVariable(project.id, 'API_KEY', 'secret-value');
 * 
 * // Repository operations
 * const branches = await client.repositories.getBranches('group/project');
 * const commits = await client.repositories.getCommits('group/project', { ref_name: 'main' });
 * const fileContent = await client.repositories.getFileContent('group/project', 'README.md');
 * 
 * // Merge Request operations
 * const mr = await client.mergeRequests.createMergeRequest(
 *   'group/project', 'feature-branch', 'main', 
 *   'MR Title', { description: 'MR Description' }
 * );
 * await client.mergeRequests.mergeMergeRequest('group/project', mr.iid);
 * 
 * // Pipeline operations
 * const pipelines = await client.pipelines.getPipelines('group/project');
 * const logs = await client.pipelines.getPipelineLogs('group/project', 12345);
 * 
 * // Webhook operations
 * const webhook = await client.webhooks.configWebhook('group', 'project', 
 *   'https://your-app.com/webhook');
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   const project = await client.projects.getProject('group/project');
 * } catch (error) {
 *   if (error instanceof GitLabNotFoundError) {
 *     console.log('Project not found');
 *   } else if (error instanceof GitLabApiError) {
 *     console.log(`GitLab API error: ${error.message}`);
 *   }
 * }
 * ```
 */
export class GitLabClient extends BaseApiClient {
  /** Service for GitLab project operations (get, list, variables) */
  public readonly projects: GitLabProjectService;
  
  /** Service for GitLab repository operations (branches, commits, files) */
  public readonly repositories: GitLabRepositoryService;
  
  /** Service for GitLab merge request operations (create, merge, list) */
  public readonly mergeRequests: GitLabMergeRequestService;
  
  /** Service for GitLab webhook operations (create, configure) */
  public readonly webhooks: GitLabWebhookService;
  
  /** Service for GitLab pipeline operations (get, logs, cancel) */
  public readonly pipelines: GitLabPipelineService;
  
  /** The underlying Gitbeaker client instance (private) */
  private readonly client: InstanceType<typeof Gitlab>;

  /**
   * Creates a new GitLab client instance
   * 
   * @param config Configuration options for the GitLab client
   * @param config.token GitLab personal access token (required)
   * @param config.baseUrl GitLab instance base URL (required)
   * @param config.timeout Request timeout in milliseconds (optional, defaults to 60000)
   * 
   * @example
   * ```typescript
   * const client = new GitLabClient({
   *   token: process.env.GITLAB_TOKEN,
   *   baseUrl: 'https://gitlab.example.com',
   *   timeout: 30000
   * });
   * ```
   */
  constructor(config: GitLabConfig) {
    super(config.baseUrl || 'https://gitlab.com', config.timeout || 60000);
    this.client = new Gitlab({
      host: this.baseUrl,
      token: config.token,
      queryTimeout: this.timeout,
      rejectUnauthorized: config.sslVerify,
    });

    this.projects = new GitLabProjectService(this.client);
    this.repositories = new GitLabRepositoryService(this.client);
    this.mergeRequests = new GitLabMergeRequestService(
      this.client,
      this.repositories
    );
    this.webhooks = new GitLabWebhookService(this.client, this.projects);
    this.pipelines = new GitLabPipelineService(this.client);
  }

  /**
   * Gets the underlying Gitbeaker client instance
   * 
   * This method provides access to the raw Gitbeaker client for advanced operations
   * that aren't covered by the service-oriented interface. Use with caution as it
   * bypasses the error handling and abstraction provided by the services.
   * 
   * @returns The Gitbeaker client instance
   * 
   * @example
   * ```typescript
   * const client = new GitLabClient(config);
   * const gitbeakerClient = client.getClient();
   * 
   * // Direct Gitbeaker API usage
   * const users = await gitbeakerClient.Users.all();
   * ```
   */
  public getClient(): InstanceType<typeof Gitlab> {
    return this.client;
  }

  /**
   * Checks if the GitLab API is reachable and the client is properly authenticated
   *
   * This method performs a lightweight API call to verify connectivity and authentication.
   * It's useful for health checks and connection validation.
   *
   * @returns Promise<boolean> True if the API is reachable and authenticated, false otherwise
   *
   * @example
   * ```typescript
   * const client = new GitLabClient(config);
   *
   * if (await client.ping()) {
   *   console.log('GitLab API is accessible');
   * } else {
   *   console.log('GitLab API is not accessible or token is invalid');
   * }
   * ```
   */
  async ping(): Promise<boolean> {
    try {
      await this.client.Projects.all({ perPage: 1 });
      return true;
    } catch {
      return false;
    }
  }
} 

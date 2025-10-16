import { BitbucketHttpClient } from './http/bitbucket-http.client';
import { BitbucketPullRequestService } from './services/bitbucket-pull-request.service';
import { BitbucketRepositoryService } from './services/bitbucket-repository.service';
import { BitbucketUserService } from './services/bitbucket-user.service';
import { BitbucketWebhookService } from './services/bitbucket-webhook.service';
import { BitbucketClientOptions } from './types/bitbucket.types';
import { BaseApiClient } from '../common/base-api.client';

/**
 * Bitbucket API Client
 * 
 * A comprehensive client for interacting with Bitbucket's REST API. This client provides
 * a service-oriented architecture with dedicated services for different Bitbucket operations
 * including pull requests, repositories, users, and webhooks.
 * 
 * @example Basic Usage
 * ```typescript
 * import { BitbucketClient } from './api/bitbucket';
 * 
 * const client = new BitbucketClient({
 *   username: 'your-username',
 *   password: 'your-password', // or app password
 *   baseUrl: 'https://api.bitbucket.org', // Optional, defaults to Bitbucket Cloud
 *   timeout: 30000 // Optional, defaults to 30 seconds
 * });
 * 
 * // Check connectivity
 * const isConnected = await client.ping();
 *
 * // Access different services
 * const pullRequests = await client.pullRequests.listPullRequests('workspace', 'repo');
 * const repositories = await client.repositories.listRepositories('workspace');
 * ```
 * 
 * @example Service-Oriented Usage
 * ```typescript
 * // Pull Request operations
 * const pr = await client.pullRequests.createPullRequest('workspace', 'repo', {
 *   title: 'PR Title',
 *   source: { branch: { name: 'feature-branch' } },
 *   destination: { branch: { name: 'main' } }
 * });
 * 
 * await client.pullRequests.mergePullRequest('workspace', 'repo', pr.id, {
 *   close_source_branch: true,
 *   merge_strategy: 'merge_commit'
 * });
 * 
 * // Repository operations
 * const repo = await client.repositories.getRepository('workspace', 'repo');
 * const branches = await client.repositories.listBranches('workspace', 'repo');
 * const commits = await client.repositories.listCommits('workspace', 'repo');
 * 
 * // User operations
 * const user = await client.users.getCurrentUser();
 * const userRepos = await client.users.listUserRepositories(user.username);
 * 
 * // Webhook operations
 * const webhook = await client.webhooks.createWebhook('workspace', 'repo', {
 *   url: 'https://your-app.com/webhook',
 *   events: ['repo:push', 'pullrequest:created']
 * });
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   const pr = await client.pullRequests.getPullRequest('workspace', 'repo', 123);
 * } catch (error) {
 *   if (error instanceof BitbucketNotFoundError) {
 *     console.log('Pull request not found');
 *   } else if (error instanceof BitbucketApiError) {
 *     console.log(`Bitbucket API error: ${error.message}`);
 *   }
 * }
 * ```
 */
export class BitbucketClient extends BaseApiClient {
  /** The underlying HTTP client instance (private) */
  private readonly httpClient: BitbucketHttpClient;
  
  /** Service for Bitbucket pull request operations (create, merge, list) */
  public readonly pullRequests: BitbucketPullRequestService;
  
  /** Service for Bitbucket repository operations (get, list, branches) */
  public readonly repositories: BitbucketRepositoryService;
  
  /** Service for Bitbucket user operations (get current user, list repos) */
  public readonly users: BitbucketUserService;
  
  /** Service for Bitbucket webhook operations (create, configure) */
  public readonly webhooks: BitbucketWebhookService;

  /**
   * Creates a new Bitbucket client instance
   * 
   * @param options Configuration options for the Bitbucket client
   * @param options.username Bitbucket username (required)
   * @param options.password Bitbucket password or app password (required)
   * @param options.baseUrl Bitbucket API base URL (optional, defaults to 'https://api.bitbucket.org')
   * @param options.timeout Request timeout in milliseconds (optional, defaults to 30000)
   * 
   * @example
   * ```typescript
   * const client = new BitbucketClient({
   *   username: process.env.BITBUCKET_USERNAME,
   *   password: process.env.BITBUCKET_APP_PASSWORD,
   *   baseUrl: 'https://api.bitbucket.org',
   *   timeout: 30000
   * });
   * ```
   */
  constructor(options: BitbucketClientOptions) {
    super(options.baseUrl || 'https://api.bitbucket.org', options.timeout || 30000);
    this.httpClient = new BitbucketHttpClient(options);
    this.pullRequests = new BitbucketPullRequestService(this.httpClient);
    this.repositories = new BitbucketRepositoryService(this.httpClient);
    this.users = new BitbucketUserService(this.httpClient);
    this.webhooks = new BitbucketWebhookService(this.httpClient);
  }

  /**
   * Checks if the Bitbucket API is reachable and the client is properly authenticated
   *
   * This method performs a lightweight API call to verify connectivity and authentication.
   * It's useful for health checks and connection validation.
   *
   * @returns Promise<boolean> True if the Bitbucket API is reachable and authenticated, false otherwise
   *
   * @example
   * ```typescript
   * const client = new BitbucketClient(config);
   *
   * if (await client.ping()) {
   *   console.log('Bitbucket API is accessible');
   * } else {
   *   console.log('Bitbucket API is not accessible or credentials are invalid');
   * }
   * ```
   */
  async ping(): Promise<boolean> {
    try {
      await this.httpClient.get('/repositories');
      return true;
    } catch {
      return false;
    }
  }
}

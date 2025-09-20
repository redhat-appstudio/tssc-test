import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import { GithubActionsService } from './services/github-actions.service';
import { GithubPullRequestService } from './services/github-pull-request.service';
import { GithubRepositoryService } from './services/github-repository.service';
import { GithubSecretsService } from './services/github-secrets.service';
import { GithubVariablesService } from './services/github-variables.service';
import { GithubWebhookService } from './services/github-webhook.service';
import { GithubClientOptions } from './types/github.types';
import { GithubError } from './errors/github.errors';
import { BaseApiClient } from '../common/base-api.client';

const EnhancedOctokit = Octokit.plugin(retry, throttling);

/**
 * GitHub API Client
 * 
 * A comprehensive client for interacting with GitHub's REST API. This client provides
 * a service-oriented architecture with dedicated services for different GitHub operations.
 * It includes built-in retry logic, rate limiting, and error handling.
 * 
 * @example Basic Usage
 * ```typescript
 * import { GithubClient } from './api/github';
 * 
 * const client = new GithubClient({
 *   token: 'ghp_your_token_here',
 *   baseUrl: 'https://api.github.com', // Optional, defaults to GitHub API
 *   timeout: 30000, // Optional, defaults to 30 seconds
 *   retryOptions: {
 *     retries: 3,
 *     doNotRetry: ['404', '422']
 *   },
 *   throttleOptions: {
 *     maxRetries: 2
 *   }
 * });
 * 
 * // Check connectivity
 * const isConnected = await client.ping();
 * const version = await client.getVersion();
 * 
 * // Access different services
 * const pullRequests = await client.pullRequests.listPullRequests('owner', 'repo');
 * const actions = await client.actions.listWorkflowRuns('owner', 'repo');
 * ```
 * 
 * @example Service-Oriented Usage
 * ```typescript
 * // Pull Request operations
 * const pr = await client.pullRequests.createPullRequest(
 *   'owner', 'repo', 'username', 'main', 'feature-branch', 
 *   'PR Title', 'PR Description'
 * );
 * 
 * // Repository operations
 * const repo = await client.repository.getRepository('owner', 'repo');
 * const content = await client.repository.getFileContent('owner', 'repo', 'path/to/file');
 * 
 * // Actions/CI operations
 * const runs = await client.actions.listWorkflowRuns('owner', 'repo', { status: 'completed' });
 * const logs = await client.actions.getWorkflowRunLogs('owner', 'repo', 12345);
 * 
 * // Secrets management
 * await client.secrets.createOrUpdateSecret('owner', 'repo', 'SECRET_NAME', 'secret-value');
 * const secrets = await client.secrets.listSecrets('owner', 'repo');
 * 
 * // Variables management
 * await client.variables.createOrUpdateVariable('owner', 'repo', 'VAR_NAME', 'variable-value');
 * const variables = await client.variables.listVariables('owner', 'repo');
 * 
 * // Webhook management
 * const webhook = await client.webhooks.createWebhook('owner', 'repo', {
 *   url: 'https://your-app.com/webhook',
 *   events: ['push', 'pull_request']
 * });
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   const pr = await client.pullRequests.getPullRequest('owner', 'repo', 123);
 * } catch (error) {
 *   if (error instanceof GithubNotFoundError) {
 *     console.log('Pull request not found');
 *   } else if (error instanceof GithubApiError) {
 *     console.log(`GitHub API error: ${error.message}`);
 *   }
 * }
 * ```
 */
export class GithubClient extends BaseApiClient {
  /** Service for GitHub Actions operations (workflows, runs, jobs) */
  public readonly actions: GithubActionsService;
  
  /** Service for Pull Request operations (create, merge, list) */
  public readonly pullRequests: GithubPullRequestService;
  
  /** Service for Repository operations (files, commits, branches) */
  public readonly repository: GithubRepositoryService;
  
  /** Service for Repository secrets management */
  public readonly secrets: GithubSecretsService;
  
  /** Service for Repository variables management */
  public readonly variables: GithubVariablesService;
  
  /** Service for Webhook management */
  public readonly webhooks: GithubWebhookService;
  
  /** The underlying Octokit instance (private) */
  private readonly octokit: Octokit;

  /**
   * Creates a new GitHub client instance
   * 
   * @param options Configuration options for the GitHub client
   * @param options.token GitHub personal access token (required)
   * @param options.baseUrl GitHub API base URL (optional, defaults to 'https://api.github.com')
   * @param options.timeout Request timeout in milliseconds (optional, defaults to 30000)
   * @param options.retryOptions Retry configuration (optional)
   * @param options.throttleOptions Rate limiting configuration (optional)
   * 
   * @example
   * ```typescript
   * const client = new GithubClient({
   *   token: process.env.GITHUB_TOKEN,
   *   baseUrl: 'https://api.github.com',
   *   timeout: 30000,
   *   retryOptions: {
   *     retries: 3,
   *     doNotRetry: ['404', '422']
   *   }
   * });
   * ```
   */
  constructor(options: GithubClientOptions) {
    super(options.baseUrl || 'https://api.github.com', options.timeout || 30000);
    this.octokit = new EnhancedOctokit({
      auth: options.token,
      baseUrl: options.baseUrl || 'https://api.github.com',
      retry: {
        doNotRetry: options.retryOptions?.doNotRetry || ['404'],
        retries: options.retryOptions?.retries || 2,
        retryAfter: 3,
      },
      throttle: {
        onRateLimit: (retryAfter, requestOptions, octokit, retryCount): boolean => {
          octokit.log.warn(
            `Request quota exhausted for request ${requestOptions.method} ${requestOptions.url}`,
          );

          if (retryCount < (options.throttleOptions?.maxRetries || 2)) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
        onSecondaryRateLimit: (retryAfter, requestOptions, octokit, retryCount): boolean => {
          octokit.log.warn(
            `SecondaryRateLimit detected for request ${requestOptions.method} ${requestOptions.url}`,
          );

          if (retryCount < (options.throttleOptions?.maxRetries || 2)) {
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
      },
    });

    // Wrap the octokit instance to handle errors consistently
    const errorHandler = (error: any) => {
      throw new GithubError(error.message, error.status, error);
    };

    const wrapOctokit = (octokitInstance: Octokit) => {
      const handler = {
        get(target: any, propKey: any, receiver: any) {
          const origMethod = target[propKey];
          if (typeof origMethod === 'function') {
            return function (...args: any[]) {
              return origMethod.apply(target, args).catch(errorHandler);
            };
          }
          return Reflect.get(target, propKey, receiver);
        },
      };
      return new Proxy(octokitInstance, handler);
    };

    const wrappedOctokit = wrapOctokit(this.octokit);

    this.actions = new GithubActionsService(wrappedOctokit);
    this.pullRequests = new GithubPullRequestService(wrappedOctokit);
    this.repository = new GithubRepositoryService(wrappedOctokit);
    this.secrets = new GithubSecretsService(wrappedOctokit);
    this.variables = new GithubVariablesService(wrappedOctokit);
    this.webhooks = new GithubWebhookService(wrappedOctokit);
  }

  /**
   * Checks if the GitHub API is reachable and the client is properly authenticated
   * 
   * This method performs a lightweight API call to verify connectivity and authentication.
   * It's useful for health checks and connection validation.
   * 
   * @returns Promise<boolean> True if the API is reachable and authenticated, false otherwise
   * 
   * @example
   * ```typescript
   * const client = new GithubClient({ token: 'your-token' });
   * 
   * if (await client.ping()) {
   *   console.log('GitHub API is accessible');
   * } else {
   *   console.log('GitHub API is not accessible or token is invalid');
   * }
   * ```
   */
  async ping(): Promise<boolean> {
    try {
      await this.octokit.rest.meta.get();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the GitHub API version information
   * 
   * Retrieves version information about the GitHub API instance. This can be useful
   * for debugging, logging, or determining API capabilities.
   * 
   * @returns Promise<string | null> The API version string, or null if unable to retrieve
   * 
   * @example
   * ```typescript
   * const client = new GithubClient({ token: 'your-token' });
   * 
   * const version = await client.getVersion();
   * if (version) {
   *   console.log(`GitHub API version: ${version}`);
   * } else {
   *   console.log('Unable to retrieve GitHub API version');
   * }
   * ```
   */
  async getVersion(): Promise<string | null> {
    try {
      const response = await this.octokit.rest.meta.get();
      return (response.data as any).installed_version || null;
    } catch {
      return null;
    }
  }
}
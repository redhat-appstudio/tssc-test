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

const EnhancedOctokit = Octokit.plugin(retry, throttling);

export class GithubClient {
  public readonly actions: GithubActionsService;
  public readonly pullRequests: GithubPullRequestService;
  public readonly repository: GithubRepositoryService;
  public readonly secrets: GithubSecretsService;
  public readonly variables: GithubVariablesService;
  public readonly webhooks: GithubWebhookService;
  private readonly octokit: Octokit;

  constructor(options: GithubClientOptions) {
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
}
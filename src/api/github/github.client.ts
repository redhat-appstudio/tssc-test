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

const EnhancedOctokit = Octokit.plugin(retry, throttling);

export class GithubClient {
  private readonly octokit: Octokit;
  private readonly actionsService: GithubActionsService;
  private readonly pullRequestService: GithubPullRequestService;
  private readonly repositoryService: GithubRepositoryService;
  private readonly secretsService: GithubSecretsService;
  private readonly variablesService: GithubVariablesService;
  private readonly webhookService: GithubWebhookService;

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

    this.actionsService = new GithubActionsService(this.octokit);
    this.pullRequestService = new GithubPullRequestService(this.octokit);
    this.repositoryService = new GithubRepositoryService(this.octokit);
    this.secretsService = new GithubSecretsService(this.octokit);
    this.variablesService = new GithubVariablesService(this.octokit);
    this.webhookService = new GithubWebhookService(this.octokit);
  }

  public get octokitInstance(): Octokit {
    return this.octokit;
  }

  public get actions(): GithubActionsService {
    return this.actionsService;
  }

  public get pullRequests(): GithubPullRequestService {
    return this.pullRequestService;
  }

  public get repository(): GithubRepositoryService {
    return this.repositoryService;
  }

  public get variables(): GithubVariablesService {
    return this.variablesService;
  }

  public get secrets(): GithubSecretsService {
    return this.secretsService;
  }

  public get webhooks(): GithubWebhookService {
    return this.webhookService;
  }
}
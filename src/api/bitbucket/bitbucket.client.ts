import { BitbucketHttpClient } from './http/bitbucket-http.client';
import { BitbucketPullRequestService } from './services/bitbucket-pull-request.service';
import { BitbucketRepositoryService } from './services/bitbucket-repository.service';
import { BitbucketUserService } from './services/bitbucket-user.service';
import { BitbucketWebhookService } from './services/bitbucket-webhook.service';
import { BitbucketClientOptions } from './types/bitbucket.types';

export class BitbucketClient {
  private readonly httpClient: BitbucketHttpClient;
  public readonly pullRequests: BitbucketPullRequestService;
  public readonly repositories: BitbucketRepositoryService;
  public readonly users: BitbucketUserService;
  public readonly webhooks: BitbucketWebhookService;

  constructor(options: BitbucketClientOptions) {
    this.httpClient = new BitbucketHttpClient(options);
    this.pullRequests = new BitbucketPullRequestService(this.httpClient);
    this.repositories = new BitbucketRepositoryService(this.httpClient);
    this.users = new BitbucketUserService(this.httpClient);
    this.webhooks = new BitbucketWebhookService(this.httpClient);
  }
}

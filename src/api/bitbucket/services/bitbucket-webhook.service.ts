import { BitbucketHttpClient } from '../http/bitbucket-http.client';
import { BitbucketWebhook } from '../types/bitbucket.types';

export class BitbucketWebhookService {
  constructor(private readonly httpClient: BitbucketHttpClient) {}

  public async createWebhook(
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
  ): Promise<BitbucketWebhook> {
    const webhookData = {
      description,
      url: webhookUrl,
      active: true,
      events,
    };
    return this.httpClient.post(`/repositories/${workspace}/${repoSlug}/hooks`, webhookData);
  }
}

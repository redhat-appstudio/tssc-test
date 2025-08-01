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
    // Validate inputs
    if (!workspace || !repoSlug) {
      throw new Error('Workspace and repository slug are required');
    }
    if (workspace.includes('/') || repoSlug.includes('/')) {
      throw new Error('Invalid workspace or repository slug format');
    }
    try {
      new URL(webhookUrl);
    } catch {
      throw new Error('Invalid webhook URL format');
    }
    const webhookData = {
      description,
      url: webhookUrl,
      active: true,
      events,
    };
    return this.httpClient.post<BitbucketWebhook>(`/repositories/${workspace}/${repoSlug}/hooks`, webhookData);
  }
}

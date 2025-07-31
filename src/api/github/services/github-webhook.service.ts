import { Octokit } from '@octokit/rest';
import { GithubApiError } from '../errors/github.errors';

export class GithubWebhookService {
  constructor(private readonly octokit: Octokit) {}

  public async configWebhook(
    repoOwner: string,
    repoName: string,
    webhookUrl: string,
  ): Promise<void> {
    try {
      console.log(`Configuring webhook for ${repoOwner}/${repoName} at ${webhookUrl}`);

      await this.octokit.repos.createWebhook({
        owner: repoOwner,
        repo: repoName,
        config: {
          url: webhookUrl,
          content_type: 'form',
          insecure_ssl: '1',
        },
        events: ['push', 'pull_request'],
        active: true,
      });
      console.log(`Webhook configured successfully for ${repoOwner}/${repoName}`);
    } catch (error: any) {
      console.error(`Failed to configure webhook for ${repoOwner}/${repoName}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to configure webhook for ${repoOwner}/${repoName}`, error.status, error);
    }
  }
}

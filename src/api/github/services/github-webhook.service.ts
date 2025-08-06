import { Octokit } from '@octokit/rest';
import { GithubApiError } from '../errors/github.errors';

export interface WebhookConfig {
  /** Webhook URL endpoint */
  url: string;
  /** Secret for payload verification (REQUIRED for security) */
  secret: string;
  /** Content type for webhook payload */
  contentType?: 'json' | 'form';
  /** Whether to allow insecure SSL (NOT RECOMMENDED - only for development) */
  insecureSSL?: boolean;
  /** Events to subscribe to */
  events?: string[];
  /** Whether webhook is active */
  active?: boolean;
}

export class GithubWebhookService {
  constructor(private readonly octokit: Octokit) {}

  public async configWebhook(
    repoOwner: string,
    repoName: string,
    config: WebhookConfig,
  ): Promise<void> {
    try {
      if (!config.secret) {
        throw new Error('Webhook secret is required for security. Please provide a secret for payload verification.');
      }

      console.log(`Configuring webhook for ${repoOwner}/${repoName} at ${config.url}`);

      const webhookConfig = {
        url: config.url,
        content_type: config.contentType || 'json',
        secret: config.secret,
        // Default to secure SSL unless explicitly overridden (and warn if insecure)
        insecure_ssl: config.insecureSSL ? '1' : '0',
      };

      if (config.insecureSSL) {
        console.warn('⚠️  WARNING: Webhook configured with insecure SSL. This should only be used in development environments.');
      }

      await this.octokit.repos.createWebhook({
        owner: repoOwner,
        repo: repoName,
        config: webhookConfig,
        events: config.events || ['push', 'pull_request'],
        active: config.active !== false, // Default to true
      });
      
      console.log(`Webhook configured successfully for ${repoOwner}/${repoName} with secure settings`);
    } catch (error: any) {
      console.error(`Failed to configure webhook for ${repoOwner}/${repoName}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to configure webhook for ${repoOwner}/${repoName}`, error.status, error);
    }
  }
}

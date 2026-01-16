import { Octokit } from '@octokit/rest';
import { GithubApiError } from '../errors/github.errors';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

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
  private readonly logger: Logger;

  constructor(private readonly octokit: Octokit) {
    this.logger = LoggerFactory.getLogger('github.webhook');
  }

  public async configWebhook(
    repoOwner: string,
    repoName: string,
    config: WebhookConfig,
  ): Promise<void> {
    try {
      if (!config.secret) {
        throw new Error('Webhook secret is required for security. Please provide a secret for payload verification.');
      }

      this.logger.info('Configuring webhook for {}/{} at {}', repoOwner, repoName, config.url);

      const webhookConfig = {
        url: config.url,
        content_type: config.contentType || 'json',
        secret: config.secret,
        // Default to secure SSL unless explicitly overridden (and warn if insecure)
        insecure_ssl: config.insecureSSL ? '1' : '0',
      };

      if (config.insecureSSL) {
        this.logger.warn('WARNING: Webhook configured with insecure SSL. This should only be used in development environments.');
      }

      await this.octokit.repos.createWebhook({
        owner: repoOwner,
        repo: repoName,
        config: webhookConfig,
        events: config.events || ['push', 'pull_request'],
        active: config.active !== false, // Default to true
      });
      
      this.logger.info('Webhook configured successfully for {}/{} with secure settings', repoOwner, repoName);
    } catch (error: any) {
      this.logger.error('Failed to configure webhook for {}/{}: {}', repoOwner, repoName, error);
      throw new GithubApiError(`Failed to configure webhook for ${repoOwner}/${repoName}`, error.status, error);
    }
  }
}

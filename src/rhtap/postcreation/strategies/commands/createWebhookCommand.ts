import { BaseCommand } from './baseCommand';

/**
 * Command to configure webhooks on GitLab repositories
 */
export class CreateWebhookCommand extends BaseCommand {
  public async execute(): Promise<void> {
    this.logStart('Webhook configuration on git repository');

    // Get webhook URL from GitLab CI
    const webhookUrl = await this.ci.getWebhookUrl();

    // Configure webhooks on both repositories
    await Promise.all([
      this.configureWebhookOnSourceRepo(webhookUrl),
      this.configureWebhookOnGitOpsRepo(webhookUrl),
    ]);

    this.logComplete('Webhook configuration on git repository');
  }

  /**
   * Configure webhook on the source repository
   * @param webhookUrl The webhook URL to configure
   */
  private async configureWebhookOnSourceRepo(webhookUrl: string): Promise<void> {
    try {
      console.log(`Configuring webhook for source repo at ${webhookUrl}`);
      await this.git.configWebhookOnSourceRepo(webhookUrl);
      console.log('Source repo webhook configured successfully');
    } catch (error) {
      console.error(`Failed to configure webhook on source repo: ${error}`);
      throw error;
    }
  }

  /**
   * Configure webhook on the GitOps repository
   * @param webhookUrl The webhook URL to configure
   */
  private async configureWebhookOnGitOpsRepo(webhookUrl: string): Promise<void> {
    try {
      console.log(`Configuring webhook for GitOps repo at ${webhookUrl}`);
      await this.git.configWebhookOnGitOpsRepo(webhookUrl);
      console.log('GitOps repo webhook configured successfully');
    } catch (error) {
      console.error(`Failed to configure webhook on GitOps repo: ${error}`);
      throw error;
    }
  }
}

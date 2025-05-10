import { BaseCommand } from './baseCommand';

/**
 * Command to configure webhooks on git repositories
 */
export class ConfigureWebhooksCommand extends BaseCommand {
  public async execute(): Promise<void> {
    this.logStart('webhooks configuration');

    const webhookUrl = `${this.jenkinsCI.getbaseUrl()}/github-webhook/`;

    await Promise.all([
      this.git.configWebhookOnSourceRepo(webhookUrl),
      this.git.configWebhookOnGitOpsRepo(webhookUrl),
    ]);

    this.logComplete('webhooks configuration');
  }
}

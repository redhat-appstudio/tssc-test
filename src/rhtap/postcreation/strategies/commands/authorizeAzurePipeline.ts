import { Component } from '../../../core/component';
import { AzureCI } from '../../../core/integration/ci/providers/azureCI';
import { BaseCommand } from './baseCommand';

const AGENT_QUEUE = 'rhtap-testing';

/**
 * Command to authorize Azure pipelines to agent pool and variable group
 */
export class AuthorizeAzurePipelines extends BaseCommand {
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart('Authorize pipelines');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([
      this.authorizeSourcePipelineForVariableGroup(),
      this.authorizeSourcePipelineForAgentPool(),
      this.authorizeGitopsPipelineForVariableGroup(),
      this.authorizeGitopsPipelineForAgentPool(),
    ]);

    this.logComplete('Authorize pipelines');
  }
  private async authorizeSourcePipelineForVariableGroup(): Promise<void> {
    await this.azureCI.authorizePipelineForVariableGroup(
      this.component.getName(),
      this.component.getName()
    );
  }
  private async authorizeSourcePipelineForAgentPool(): Promise<void> {
    await this.azureCI.authorizePipelineForAgentPool(this.component.getName(), AGENT_QUEUE);
  }
  private async authorizeGitopsPipelineForVariableGroup(): Promise<void> {
    await this.azureCI.authorizePipelineForVariableGroup(
      this.component.getGit().getGitOpsRepoName(),
      this.component.getName()
    );
  }
  private async authorizeGitopsPipelineForAgentPool(): Promise<void> {
    await this.azureCI.authorizePipelineForAgentPool(
      this.component.getGit().getGitOpsRepoName(),
      AGENT_QUEUE
    );
  }
}

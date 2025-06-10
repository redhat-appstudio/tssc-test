import { Component } from '../../../core/component';
import { AzureCI } from '../../../core/integration/ci/providers/azureCI';
import { BaseCommand } from './baseCommand';

/**
 * Command to authorize Azure pipeline to agent pool and variable group
 */
export class AuthorizeAzurePipeline extends BaseCommand {
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart('secrets addition');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([this.authorizeForVariableGroup(), this.authorizePipelineForAgentPool()]);

    this.logComplete('secrets addition');
  }
  private async authorizePipelineForAgentPool(): Promise<void> {
    await this.azureCI.authorizePipelineForAgentPool(this.component);
  }
  private async authorizeForVariableGroup(): Promise<void> {
    await this.azureCI.authorizePipelineForVariableGroup(this.component);
  }
}

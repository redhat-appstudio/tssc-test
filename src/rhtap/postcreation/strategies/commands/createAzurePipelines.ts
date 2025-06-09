import { Component } from '../../../core/component';
import { AzureCI } from '../../../core/integration/ci/providers/azureCI';
import { BaseCommand } from './baseCommand';

export class CreateAzurePipelines extends BaseCommand {
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart('Azure Pipeline creation');

    try {
      const yamlFilePath = 'azure-pipelines.yml';

      await this.azureCI.createPipeline(
        this.component.getName(),
        `${this.git.getRepoOwner()}/${this.git.getSourceRepoName()}`,
        this.git.getGitType(),
        yamlFilePath
      );

      this.logComplete('Azure Pipeline creation');
    } catch (error) {
      console.log('Azure Pipeline creation', error);
      throw error;
    }
  }
}

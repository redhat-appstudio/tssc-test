import { Component } from '../../../core/component';
import { AzureCI } from '../../../core/integration/ci/providers/azureCI';
import { BaseCommand } from './baseCommand';
import { LoggerFactory, Logger } from '../../../../logger/logger';

const AZURE_PIPELINES_FILE_PATH = 'azure-pipelines.yml';

export class CreateAzurePipelines extends BaseCommand {
  protected readonly logger: Logger = LoggerFactory.getLogger('postcreation.command.azure.pipelines');
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart(`Creating pipelines for component: ${this.component.getName()}`);

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([this.createSourcePipeline(), this.createGitopsPipeline()]);
  }

  public async createSourcePipeline(): Promise<void> {
    this.logStart(`Creating source pipeline for component ${this.component.getName()}`);

    try {
      const serviceEndpoint = await this.azureCI.createServiceEndpoint(
        this.component.getGit().getSourceRepoName(),
        this.git.getGitType(),
        'https://' + this.git.getHost(),
        this.component.getGit().getToken()
      );

      await this.azureCI.createPipeline(
        this.component.getName(),
        `${this.git.getRepoOwner()}/${this.git.getSourceRepoName()}`,
        this.git.getGitType(),
        serviceEndpoint,
        AZURE_PIPELINES_FILE_PATH
      );

      this.logComplete('Azure source pipeline creation');
    } catch (error) {
      this.logger.error(`Azure source pipeline creation failed: ${error}`);
      throw error;
    }
  }

  public async createGitopsPipeline(): Promise<void> {
    this.logStart(`Creating gitops pipeline for component ${this.component.getName()}`);

    try {
      const serviceEndpoint = await this.azureCI.createServiceEndpoint(
        this.component.getGit().getGitOpsRepoName(),
        this.git.getGitType(),
        'https://' + this.git.getHost(),
        this.component.getGit().getToken()
      );

      await this.azureCI.createPipeline(
        this.component.getGit().getGitOpsRepoName(),
        `${this.git.getRepoOwner()}/${this.git.getGitOpsRepoName()}`,
        this.git.getGitType(),
        serviceEndpoint,
        AZURE_PIPELINES_FILE_PATH
      );

      this.logComplete('Azure gitops pipeline creation');
    } catch (error) {
      this.logger.error(`Azure gitops pipeline creation failed: ${error}`);
      throw error;
    }
  }
}

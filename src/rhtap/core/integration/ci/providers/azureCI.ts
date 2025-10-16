import {
  AzureBuild,
  AzureClient,
  AzurePipelineDefinition,
  AzurePipelineRun,
  AzurePipelineRunResult,
  AzurePipelineRunStatus,
  AzurePipelineTriggerReason,
  ServiceEndpoint,
} from '../../../../../api/ci/azureClient';
import { KubeClient } from '../../../../../api/ocp/kubeClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';
import retry from 'async-retry';

export interface Variable {
  key: string;
  value: string;
  isSecret: boolean;
}

export class AzureCI extends BaseCI {
  private azureClient!: AzureClient;
  private componentName: string;
  private secret!: Record<string, string>;
  private projectName: string;

  constructor(componentName: string, projectName: string, kubeClient: KubeClient) {
    super(CIType.AZURE, kubeClient);
    this.componentName = componentName;
    this.projectName = projectName;
  }

  private async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-azure-integration', 'tssc');
    if (!secret) {
      throw new Error('Azure secret not found in the cluster. Please ensure the secret exists.');
    }
    this.secret = secret;
    return secret;
  }

  public getHost(): string {
    if (!this.secret.host) {
      throw new Error('Azure host not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.host;
  }

  public getOrganization(): string {
    if (!this.secret.organization) {
      throw new Error(
        'Azure organization not found in the secret. Please ensure the secret exists.'
      );
    }
    return this.secret.organization;
  }

  public getToken(): string {
    if (!this.secret.token) {
      throw new Error('Azure token not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.token;
  }

  public async getIntegrationSecret(): Promise<Record<string, string>> {
    await this.loadSecret();
    return this.secret;
  }

  public getWebhookUrl(): Promise<string> {
    throw new Error('Method not implemented.');
  }

  private async initAzureClient(): Promise<void> {
    try {
      await this.loadSecret();
      this.azureClient = new AzureClient({
        host: this.getHost(),
        organization: this.getOrganization(),
        project: this.projectName,
        pat: this.getToken(),
      });

      console.log('Azure client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Azure client:', error);
      throw error;
    }
  }

  /**
   * Initialize the Azure client using credentials from cluster
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadSecret();
      await this.initAzureClient();
      console.log('Azure client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Azure client:', error);
      throw error;
    }
  }

  private mapAzureStatusToPipelineStatus(azureRun: AzurePipelineRun): PipelineStatus {
    if (!azureRun) return PipelineStatus.UNKNOWN;

    switch (azureRun.state) {
      case AzurePipelineRunStatus.NOT_STARTED:
      case AzurePipelineRunStatus.POSTPONED:
        return PipelineStatus.PENDING;
      case AzurePipelineRunStatus.IN_PROGRESS:
      case AzurePipelineRunStatus.CANCELLING:
        return PipelineStatus.RUNNING;
      case AzurePipelineRunStatus.COMPLETED:
        switch (azureRun.result) {
          case AzurePipelineRunResult.SUCCEEDED:
            return PipelineStatus.SUCCESS;
          case AzurePipelineRunResult.PARTIALLY_SUCCEEDED:
            return PipelineStatus.SUCCESS;
          case AzurePipelineRunResult.FAILED:
            return PipelineStatus.FAILURE;
          case AzurePipelineRunResult.CANCELED:
            return PipelineStatus.CANCELLED;
          default:
            return PipelineStatus.UNKNOWN;
        }
      default:
        return PipelineStatus.UNKNOWN;
    }
  }

  private convertAzureRunToPipeline(
    azureRun: AzurePipelineRun,
    pipelineDef: AzurePipelineDefinition
  ): Pipeline {
    const pipelineInstance = new Pipeline(
      pipelineDef.id.toString(),
      this.ciType,
      pipelineDef.repository?.name || this.componentName,
      this.mapAzureStatusToPipelineStatus(azureRun)
    );

    pipelineInstance.buildNumber = azureRun.id;
    pipelineInstance.name = azureRun.name;
    pipelineInstance.url = azureRun.url;
    pipelineInstance.startTime = azureRun.createdDate ? new Date(azureRun.createdDate) : undefined;
    pipelineInstance.endTime = azureRun.finishedDate ? new Date(azureRun.finishedDate) : undefined;
    return pipelineInstance;
  }

  private mapAzureBuildStatusToPipelineStatus(azureBuild: AzureBuild): PipelineStatus {
    if (!azureBuild) return PipelineStatus.UNKNOWN;

    switch (azureBuild.status) {
      case 'succeeded':
        return PipelineStatus.SUCCESS;
      case 'failed':
        return PipelineStatus.FAILURE;
      case 'inProgress':
        return PipelineStatus.RUNNING;
      case 'notStarted':
        return PipelineStatus.PENDING;
      case 'stopped':
        return PipelineStatus.CANCELLED;
      default:
        return PipelineStatus.UNKNOWN;
    }
  }

  private convertAzureBuildToPipeline(
    azureBuild: AzureBuild,
    pipelineDef: AzurePipelineDefinition
  ): Pipeline {
    const pipelineInstance = new Pipeline(
      pipelineDef.id.toString(),
      this.ciType,
      pipelineDef.repository?.name || this.componentName,
      this.mapAzureBuildStatusToPipelineStatus(azureBuild)
    );

    pipelineInstance.name = `${pipelineDef.id}-${azureBuild.id}`;
    pipelineInstance.buildNumber = azureBuild.id;
    pipelineInstance.url = azureBuild.url;
    pipelineInstance.startTime = azureBuild.startTime ? new Date(azureBuild.startTime) : undefined;
    pipelineInstance.endTime = azureBuild.finishTime ? new Date(azureBuild.finishTime) : undefined;
    pipelineInstance.sha = (azureBuild as AzureBuild).sourceGetVersion;

    return pipelineInstance;
  }

  public async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus?: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    try {
      const pipelineDefSource = await this.azureClient.getPipelineDefinition(this.componentName);
      const pipelineDefGitops = await this.azureClient.getPipelineDefinition(
        this.componentName + '-gitops'
      );
      if (!pipelineDefSource || !pipelineDefGitops) {
        return null;
      }

      console.log(
        `Retrieving pipelineruns for pipelines with id: ${pipelineDefSource.id} and ${pipelineDefGitops.id}`
      );

      const runsSource: AzurePipelineRun[] = await this.azureClient.listPipelineRuns(
        pipelineDefSource.id
      );
      const runsGitops: AzurePipelineRun[] = await this.azureClient.listPipelineRuns(
        pipelineDefGitops.id
      );
      let runs = [...runsSource, ...runsGitops];

      // 0 is for dummy pull request
      if (pullRequest.pullNumber != 0) {
        console.log(
          `Filtering runs for pull request ${pullRequest.pullNumber} with sha ${pullRequest.sha}`
        );
        runs = runs.filter(
          run => run.variables?.['system.pullRequest.sourceCommitId']?.value === pullRequest.sha
        );
      }

      let builds: AzureBuild[] = await Promise.all(
        runs.map(run => this.azureClient.getBuild(run.id))
      );

      if (eventType == EventType.PULL_REQUEST) {
        // PR Automated shows in the azure pipeline api response as manual build
        builds = builds.filter(run => run.reason === AzurePipelineTriggerReason.MANUAL);
      } else if (eventType == EventType.PUSH) {
        builds = builds.filter(run => run.reason === AzurePipelineTriggerReason.INDIVIDUAL_CI);
      }

      const targetBuild = builds[builds.length - 1];
      console.log(`Retrieved build ${JSON.stringify(targetBuild)}`);

      if (!targetBuild) {
        return null;
      }

      const isFromSourcePipeline = runsSource.some(run => run.id === targetBuild.id);
      const pipelineDefToUse = isFromSourcePipeline ? pipelineDefSource : pipelineDefGitops;

      const pipeline = this.convertAzureBuildToPipeline(targetBuild, pipelineDefToUse);

      if (pipelineStatus !== undefined && pipeline.status !== pipelineStatus) {
        return null;
      }

      return pipeline;
    } catch (error) {
      console.error(`Error in getPipeline for ${this.componentName}:`, error);
      return null;
    }
  }

  public async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    const pipelineRun = await this.azureClient.getPipelineRunLogs(
      Number(pipeline.id),
      pipeline.buildNumber!
    );
    return pipelineRun;
  }

  protected async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    const pipelineRun = await this.azureClient.getPipelineRun(
      Number(pipeline.id),
      pipeline.buildNumber!
    );

    return this.mapAzureStatusToPipelineStatus(pipelineRun);
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return 'azure-pipelines.yml';
  }

  public async waitForAllPipelineRunsToFinish(): Promise<void> {
    await retry(
      async () => {
        console.log(`Waiting for all pipelines to finish for component: ${this.componentName}`);
        const pipelineId = await this.azureClient.getPipelineIdByName(this.componentName);
        if (!pipelineId) {
          return;
        }
        const pipelineRuns = await this.azureClient.listPipelineRuns(pipelineId);

        if (
          pipelineRuns.filter(
            pipelineRun =>
              this.mapAzureStatusToPipelineStatus(pipelineRun) == PipelineStatus.PENDING ||
              this.mapAzureStatusToPipelineStatus(pipelineRun) == PipelineStatus.RUNNING
          ).length === 0
        ) {
          return;
        }
      },
      {
        retries: 40,
        minTimeout: 10000,
        maxTimeout: 30000,
      }
    );
  }

  public async createServiceEndpoint(
    serviceEndpointName: string,
    serviceEndpointType: string,
    gitHost: string,
    gitToken: string
  ): Promise<ServiceEndpoint> {
    try {
      const projectId = await this.azureClient.getProjectIdByName(this.projectName);

      const serviceEndpoint = await this.azureClient.createServiceEndpoint(
        serviceEndpointName,
        serviceEndpointType,
        gitHost,
        gitToken,
        projectId
      );

      return serviceEndpoint;
    } catch (error) {
      console.error(`Failed to create service endpoint '${serviceEndpointName}':`, error);
      throw error;
    }
  }

  public async createPipeline(
    pipelineName: string,
    repoId: string,
    repoType: string,
    serviceEndpoint: ServiceEndpoint,
    yamlPath: string
  ): Promise<unknown> {
    try {
      const pipelineDefinition = await this.azureClient.createPipelineDefinition(
        pipelineName,
        repoId,
        repoType,
        yamlPath,
        serviceEndpoint.id
      );

      return pipelineDefinition;
    } catch (error) {
      console.error(`Failed to create Azure pipeline '${pipelineName}':`, error);
      throw error;
    }
  }

  public async deletePipeline(pipelineName: string): Promise<void> {
    try {
      const pipelineId = await this.azureClient.getPipelineIdByName(pipelineName);
      if (!pipelineId) {
        console.warn(`Pipeline with name '${pipelineName}' not found. Skipping deletion.`);
        return;
      }

      await this.azureClient.deletePipeline(pipelineId);
      console.log(`Successfully deleted pipeline '${pipelineName}' with ID: ${pipelineId}`);
    } catch (error) {
      console.error(`Failed to delete Azure pipeline '${pipelineName}':`, error);
      throw error;
    }
  }

  public async createVariableGroup(
    groupName: string,
    variables: Variable[],
    description?: string
  ): Promise<void> {
    const azureVariables: { [key: string]: { value: string; isSecret: boolean } } = {};
    for (const variable of variables) {
      azureVariables[variable.key] = {
        value: variable.value,
        isSecret: variable.isSecret,
      };
    }

    try {
      await this.azureClient.createVariableGroup(
        groupName,
        description || `Variable group for ${groupName}`,
        azureVariables
      );
    } catch (error) {
      console.error(`Failed to create or update variable group '${groupName}':`, error);
      throw error;
    }
  }

  public async deleteVariableGroup(groupName: string): Promise<void> {
    try {
      if (!this.azureClient) {
        await this.initialize();
      }

      const variableGroup = await this.azureClient.getVariableGroupByName(groupName);
      if (!variableGroup) {
        console.warn(`Variable group with name '${groupName}' not found. Skipping deletion.`);
        return;
      }

      const projectId = await this.azureClient.getProjectIdByName(this.projectName);
      await this.azureClient.deleteVariableGroup(variableGroup.id, projectId);
      console.log(
        `Successfully deleted variable group '${groupName}' with ID: ${variableGroup.id}`
      );
    } catch (error) {
      console.error(`Failed to delete variable group '${groupName}':`, error);
      throw error;
    }
  }

  public async authorizePipelineForAgentPool(
    pipelineName: string,
    poolName: string
  ): Promise<unknown> {
    const pipelineId = await this.azureClient.getPipelineIdByName(pipelineName);
    const agentQueueId = await this.azureClient.getAgentQueueByName(poolName);
    return await this.azureClient.authorizePipelineForAgentPool(pipelineId!, agentQueueId!.id);
  }

  public async authorizePipelineForVariableGroup(
    pipelineName: string,
    varGroupName: string
  ): Promise<unknown> {
    const pipelineId = await this.azureClient.getPipelineIdByName(pipelineName);
    const variableGroup = await this.azureClient.getVariableGroupByName(varGroupName);
    return await this.azureClient.authorizePipelineForVariableGroup(pipelineId!, variableGroup!.id);
  }

  public async deleteServiceEndpoint(endpointName: string): Promise<void> {
    const endpoint = await this.azureClient.getServiceEndpointByName(endpointName);
    const projectId = await this.azureClient.getProjectIdByName(this.projectName);
    if (!endpoint) {
      console.warn(`Service endpoint with name '${endpointName}' not found. Skipping deletion.`);
      return;
    }
    await this.azureClient.deleteServiceEndpoint(endpoint.id, projectId);
  }

  public async cancelAllInitialPipelines(): Promise<void> {
    // TODO: Implement Azure pipeline cancellation logic
    console.log(`Azure CI: cancelAllInitialPipelines not yet implemented for ${this.componentName}`);
  }
}

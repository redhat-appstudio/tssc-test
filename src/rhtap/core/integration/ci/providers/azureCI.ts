import {
  AzureClient,
  AzurePipelineDefinition,
  AzurePipelineRun,
  AzurePipelineRunResult,
  AzurePipelineRunStatus,
  AzurePipelineTriggerReason,
} from '../../../../../api/ci/azureClient';
import { KubeClient } from '../../../../../api/ocp/kubeClient';
import { Component } from '../../../component';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';
import retry from 'async-retry';

const AGENT_QUEUE = 'rhtap-testing';
export interface Variable {
  key: string;
  value: string;
}

export class AzureCI extends BaseCI {
  private azureClient!: AzureClient;
  private componentName: string;
  private secret!: Record<string, string>;

  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.AZURE, kubeClient);
    this.componentName = componentName;
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

  private async initAzureClient(): Promise<void> {
    try {
      await this.loadSecret();
      this.azureClient = new AzureClient({
        host: this.getHost(),
        organization: this.getOrganization(),
        project: this.componentName,
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
      case AzurePipelineRunStatus.IN_PROGRESS:
      case AzurePipelineRunStatus.NOT_STARTED:
      case AzurePipelineRunStatus.POSTPONED:
        return PipelineStatus.RUNNING;
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
    const pipelineId = `${pipelineDef.id}-${azureRun.id}`;
    const pipelineInstance = new Pipeline(
      pipelineId,
      this.ciType,
      pipelineDef.repository?.name || this.componentName,
      this.mapAzureStatusToPipelineStatus(azureRun)
    );

    pipelineInstance.name = azureRun.name;
    pipelineInstance.url = azureRun._links?.web?.href;
    pipelineInstance.startTime = azureRun.createdDate ? new Date(azureRun.createdDate) : undefined;
    pipelineInstance.endTime = azureRun.finishedDate ? new Date(azureRun.finishedDate) : undefined;
    pipelineInstance.sha =
      azureRun.sourceVersion ||
      azureRun.triggerInfo?.['ci.sourceSha'] ||
      azureRun.triggerInfo?.['pr.sourceSha'];
    return pipelineInstance;
  }

  public async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus?: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    try {
      const pipelineDef = await this.azureClient.getPipelineDefinition(this.componentName);
      if (!pipelineDef) {
        return null;
      }

      let runs: AzurePipelineRun[] = [];
      if (pullRequest.head?.sha) {
        runs = await this.azureClient.listPipelineRuns(pipelineDef.id, {
          sourceVersion: pullRequest.head.sha,
          queryOrder: 'finishTimeDescending',
        });
      } else if (pullRequest.head?.ref) {
        const branchName = pullRequest.head.ref.startsWith('refs/heads/')
          ? pullRequest.head.ref
          : `refs/heads/${pullRequest.head.ref}`;
        runs = await this.azureClient.listPipelineRuns(pipelineDef.id, {
          branchName: branchName,
          top: 1,
          queryOrder: 'finishTimeDescending',
        });
      } else {
        const latestRun = await this.azureClient.getLatestPipelineRun(pipelineDef.id);
        if (latestRun) runs = [latestRun];
      }

      if (runs.length === 0) {
        return null;
      }

      if (eventType == EventType.PULL_REQUEST) {
        runs.filter(run => run.reason === AzurePipelineTriggerReason.PULL_REQUEST);
      } else if (eventType == EventType.PUSH) {
        runs.filter(run => run.reason === AzurePipelineTriggerReason.INDIVIDUAL_CI);
      }

      const targetRun = runs[0];
      const pipeline = this.convertAzureRunToPipeline(targetRun, pipelineDef);

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
    return 'Placeholder logs';
    // try {
    //   const logs = await this.azureClient.getPipelineRunLogContent(
    //     Number(pipeline.pipelineDefinitionId),
    //     Number(pipeline.ciSystemId)
    //   );
    //   return logs || "No logs content returned.";
    // } catch (error) {
    //   console.error(`Error fetching logs for Azure run ${pipeline.ciSystemId}:`, error);
    //   throw error;
    // }
  }

  protected async checkPipelineStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    const pipelineRun = await this.azureClient.getPipelineRun(pipeline.id, pipeline.name!);

    return this.mapAzureStatusToPipelineStatus(pipelineRun);
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
        retries: 30,
        minTimeout: 10000,
        maxTimeout: 30000,
      }
    );
  }

  public getWebhookUrl(): Promise<string> {
    throw new Error('Method not implemented.');
  }

  public async getIntegrationSecret(): Promise<Record<string, string>> {
    await this.loadSecret();
    return this.secret;
  }

  public async createPipeline(
    pipelineName: string,
    repoId: string,
    repoType: string,
    yamlPath: string
  ): Promise<unknown> {
    try {
      const azureRepoType = repoType.toLowerCase() === 'github' ? 'gitHub' : repoType;

      const pipelineDefinition = await this.azureClient.createPipelineDefinition(
        pipelineName,
        repoId,
        azureRepoType,
        yamlPath
      );

      return pipelineDefinition;
    } catch (error) {
      console.error(`Failed to create Azure pipeline '${pipelineName}':`, error);
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
        isSecret: true,
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

  public async authorizePipelineForAgentPool(component: Component): Promise<unknown> {
    const pipelineId = await this.azureClient.getPipelineIdByName(component.getName());
    const agentQueueId = await this.azureClient.getAgentQueueByName(AGENT_QUEUE);
    return await this.azureClient.authorizePipelineForAgentPool(pipelineId!, agentQueueId!.id);
  }

  public async authorizePipelineForVariableGroup(component: Component): Promise<unknown> {
    const pipelineId = await this.azureClient.getPipelineIdByName(component.getName());
    const variableGroup = await this.azureClient.getVariableGroupByName(component.getName());
    return await this.azureClient.authorizePipelineForVariableGroup(pipelineId!, variableGroup!.id);
  }
}

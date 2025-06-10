import axios, { AxiosError, AxiosInstance } from 'axios';
import { error } from 'console';

export enum AzurePipelineRunStatus {
  CANCELLING = 'cancelling',
  COMPLETED = 'completed',
  IN_PROGRESS = 'inProgress',
  NOT_STARTED = 'notStarted',
  POSTPONED = 'postponed',
  UNKNOWN = 'unknown',
}

export enum AzurePipelineRunResult {
  CANCELED = 'canceled',
  FAILED = 'failed',
  SUCCEEDED = 'succeeded',
  SKIPPED = 'skipped',
  PARTIALLY_SUCCEEDED = 'partiallySucceeded',
  UNKNOWN = 'unknown',
}

export enum AzurePipelineTriggerReason {
  MANUAL = 'manual',
  INDIVIDUAL_CI = 'individualCI',
  BATCH_CI = 'batchedCI',
  SCHEDULE = 'schedule',
  PULL_REQUEST = 'pullRequest',
  USER_CREATED = 'userCreated',
  VALIDATE_SHELVESET = 'validateShelveset',
  CHECK_IN_SHELVESET = 'checkInShelveset',
  RESOURCE_TRIGGER = 'resourceTrigger',
  BUILD_COMPLETION = 'buildCompletion',
  UNKNOWN = 'unknown',
}

export interface AzurePipelineRun {
  id: number;
  name: string;
  pipeline: {
    id: number;
    name: string;
    folder?: string;
    url?: string;
  };
  state: AzurePipelineRunStatus;
  result?: AzurePipelineRunResult | null;
  createdDate: string;
  finishedDate?: string | null;
  url: string;
  _links: {
    web: { href: string };
    self: { href: string };
    [key: string]: unknown;
  };
  triggerInfo?: {
    'ci.sourceSha'?: string;
    'ci.triggerRepository'?: string;
    'ci.message'?: string;
    'pr.sourceSha'?: string;
    'pr.sourceBranch'?: string;
    'pr.pullRequestId'?: string;
    'pr.title'?: string;
    [key: string]: string | undefined;
  };
  sourceVersion?: string;
  sourceBranch?: string;
  reason?: AzurePipelineTriggerReason;
  variables?: { [key: string]: { value: string; isSecret?: boolean } };
  templateParameters?: { [key: string]: unknown };
}

export interface AzurePipelineDefinition {
  id: number;
  name: string;
  folder: string;
  path: string;
  url: string;
  _links: {
    web: { href: string };
    self: { href: string };
  };
  repository?: {
    id: string;
    type: string;
    name: string;
    defaultBranch?: string;
  };
  process: { type: 1; yamlFilename: string } | { type: 2 };
  revision: number;
}

interface AzurePipelinesClientConfig {
  host: string;
  organization: string;
  project: string;
  pat: string;
  apiVersion?: string;
}

export interface ListPipelineRunsOptions {
  top?: number;
  statusFilter?: AzurePipelineRunStatus;
  resultFilter?: AzurePipelineRunResult;
  reasonFilter?: AzurePipelineTriggerReason;
  branchName?: string;
  queryOrder?:
    | 'queueTimeAscending'
    | 'queueTimeDescending'
    | 'startTimeAscending'
    | 'startTimeDescending'
    | 'finishTimeAscending'
    | 'finishTimeDescending';
  minTime?: string;
  maxTime?: string;
  repositoryId?: string;
  sourceVersion?: string;
  tags?: string;
}

export interface AgentPool {
  id: number;
  name: string;
  poolType: 'automation' | 'deployment';
  isHosted: boolean;
}

export interface AgentQueue {
  id: number;
  name: string;
  pool: {
    id: number;
    name: string;
    isHosted: boolean;
  };
}

export interface VariableGroup {
  id: number;
  name: string;
}

export class AzureClient {
  private client: AxiosInstance;
  private host: string;
  private organization: string;
  private project: string;
  private apiVersion: string;

  constructor(config: AzurePipelinesClientConfig) {
    this.host = config.host;
    this.organization = config.organization;
    //TODO Add env var
    this.project = 'shared-public';
    this.apiVersion = config.apiVersion || '7.1-preview.1';

    const base64Pat = Buffer.from(`:${config.pat}`).toString('base64');
    this.client = axios.create({
      baseURL: `https://${this.host}/${this.organization}/${this.project}/_apis`,
      headers: {
        Authorization: `Basic ${base64Pat}`,
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        if (error.response) {
          console.error(
            `Azure DevOps API Error: ${error.response.status} ${error.response.statusText}`,
            error.response.data
          );
        } else if (error.request) {
          console.error('Azure DevOps API Error: No response received', error.request);
        } else {
          console.error('Azure DevOps API Error: Request setup failed', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  private getApiVersionParam(): string {
    return `api-version=${this.apiVersion}`;
  }

  public async getPipelineDefinition(
    pipelineName: string
  ): Promise<AzurePipelineDefinition | null> {
    try {
      const listResponse = await this.client.get(`pipelines?${this.getApiVersionParam()}`);
      const allPipelines = listResponse.data.value as AzurePipelineDefinition[];
      const foundPipeline = allPipelines.find(p => p.name === pipelineName);

      if (foundPipeline) {
        return foundPipeline;
      } else {
        console.warn(`Pipeline with name '${pipelineName}' not found in project.`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to find pipeline definition for '${pipelineName}':`, error);
      throw error;
    }
  }

  public async getPipelineRun(
    pipelineId: number | string,
    runId: number | string
  ): Promise<AzurePipelineRun> {
    try {
      const response = await this.client.get(
        `pipelines/${pipelineId}/runs/${runId}?${this.getApiVersionParam()}`
      );
      const runInfo = response.data as AzurePipelineRun;

      if (!runInfo.reason && runInfo.triggerInfo) {
        runInfo.reason = this.determineTriggerEvent(runInfo);
      }

      return runInfo;
    } catch (error) {
      console.error(`Failed to get pipeline run ID ${runId} for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  private determineTriggerEvent(run: AzurePipelineRun): AzurePipelineTriggerReason {
    if (run.reason) {
      if (
        Object.values(AzurePipelineTriggerReason).includes(run.reason as AzurePipelineTriggerReason)
      ) {
        return run.reason as AzurePipelineTriggerReason;
      }
    }
    if (run.triggerInfo) {
      if (
        run.triggerInfo['pr.pullRequestId'] ||
        run.triggerInfo['Build.Reason'] === 'PullRequest'
      ) {
        return AzurePipelineTriggerReason.PULL_REQUEST;
      }
      if (
        run.triggerInfo['ci.sourceSha'] ||
        run.triggerInfo['Build.Reason'] === 'IndividualCI' ||
        run.triggerInfo['Build.Reason'] === 'BatchedCI'
      ) {
        return AzurePipelineTriggerReason.INDIVIDUAL_CI;
      }
    }
    if (run.reason === 'manual' || run.reason === 'userCreated') {
      return AzurePipelineTriggerReason.MANUAL;
    }

    if (run.reason === 'schedule') {
      return AzurePipelineTriggerReason.SCHEDULE;
    }

    return AzurePipelineTriggerReason.UNKNOWN;
  }

  private async getAllPipelines(): Promise<AzurePipelineDefinition[]> {
    try {
      const pipelines = await this.client.get(`/pipelines?${this.getApiVersionParam()}`);
      return pipelines.data.value;
    } catch (error) {
      console.log(`Failed to retrieve all pipelines`, error);
      throw error;
    }
  }

  public async getPipelineIdByName(pipelineName: string): Promise<number | null> {
    console.log(`Getting id for pipeline with name ${pipelineName}`);
    const pipelines = await this.getAllPipelines();

    const pipeline = pipelines.find(pipeline => pipeline.name === pipelineName);

    return pipeline === undefined ? null : pipeline.id;
  }

  public async listPipelineRuns(
    pipelineId: number,
    options: ListPipelineRunsOptions = {}
  ): Promise<AzurePipelineRun[]> {
    try {
      console.log(`PipelineId ${pipelineId}, ${typeof pipelineId}`);

      // const paramMappings: Array<{
      //   optionKey: keyof ListPipelineRunsOptions;
      //   apiKey: string;
      //   transform?: (value: any) => string;
      // }> = [
      //   { optionKey: 'top', apiKey: '$top', transform: v => v.toString() },
      //   { optionKey: 'statusFilter', apiKey: 'statusFilter' },
      //   { optionKey: 'resultFilter', apiKey: 'resultFilter' },
      //   { optionKey: 'reasonFilter', apiKey: 'reasonFilter' },
      //   {
      //     optionKey: 'branchName',
      //     apiKey: 'branchName',
      //     transform: v => (v.startsWith('refs/') ? v : `refs/heads/${v}`),
      //   },
      //   { optionKey: 'queryOrder', apiKey: 'queryOrder' },
      //   { optionKey: 'minTime', apiKey: 'minFinishTime' },
      //   { optionKey: 'maxTime', apiKey: 'maxFinishTime' },
      //   { optionKey: 'repositoryId', apiKey: 'repositoryId' },
      //   { optionKey: 'sourceVersion', apiKey: 'sourceVersion' },
      //   { optionKey: 'tags', apiKey: 'tags' },
      // ];

      //const params = new URLSearchParams();
      // params.append(this.getApiVersion().split('=')[0], this.getApiVersion().split('=')[1]);

      // for (const mapping of paramMappings) {
      //   const optionValue = options[mapping.optionKey];
      //   if (optionValue !== undefined && optionValue !== null) {
      //     const apiValue = mapping.transform ? mapping.transform(optionValue) : String(optionValue);
      //     params.append(mapping.apiKey, apiValue);
      //   }
      // }

      const response = await this.client.get(`pipelines/${pipelineId}/runs?api-version=7.0`);
      return (response.data.value || []) as AzurePipelineRun[];
    } catch (error) {
      console.error(`Failed to list runs for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  public async getRunningPipelineRuns(pipelineId: number): Promise<AzurePipelineRun[]> {
    return this.listPipelineRuns(pipelineId, { statusFilter: AzurePipelineRunStatus.IN_PROGRESS });
  }

  public async getLatestPipelineRun(
    pipelineId: number,
    branch?: string
  ): Promise<AzurePipelineRun | null> {
    const options: ListPipelineRunsOptions = {
      top: 1,
      queryOrder: 'finishTimeDescending',
    };
    if (branch) {
      options.branchName = branch;
    }
    const runs = await this.listPipelineRuns(pipelineId, options);
    return runs.length > 0 ? runs[0] : null;
  }

  public async createPipelineDefinition(
    pipelineName: string,
    repositoryId: string,
    repositoryType: string,
    yamlFilePath: string,
    serviceConnectionId = '743c6aec-3848-4410-a033-dfc2316d038e',
    folderPath?: string
  ): Promise<AzurePipelineDefinition> {
    console.log(`${repositoryId} ${repositoryType} ${pipelineName}`);
    try {
      const payload = {
        folder: folderPath,
        name: pipelineName,
        configuration: {
          type: 'yaml',
          path: yamlFilePath,
          repository: {
            id: repositoryId,
            fullname: repositoryId,
            type: repositoryType,
            connection: {
              id: serviceConnectionId,
            },
          },
        },
      };

      const response = await this.client.post(`/pipelines?${this.getApiVersionParam()}`, payload);
      return response.data as AzurePipelineDefinition;
    } catch (error) {
      console.error(`Failed to create pipeline definition '${pipelineName}':`, error);
      throw error;
    }
  }

  public async createVariableGroup(
    groupName: string,
    description: string,
    variables: { [key: string]: { value: string; isSecret: boolean } }
  ): Promise<void> {
    try {
      const payload = {
        name: groupName,
        description: description,
        type: 'Vsts',
        variables: variables,
        variableGroupProjectReferences: [
          { projectReference: { id: this.project, name: this.project }, name: groupName },
        ],
      };
      const response = await this.client.post(
        `distributedtask/variablegroups?${this.getApiVersionParam()}`,
        payload
      );
      //TODO check response
      console.log(`AzureCI group creation response: ${response.data}`);
    } catch (error) {
      console.error(`Failed to create variable group '${groupName}':`, error);
      throw error;
    }
  }

  public async getAgentQueueByName(queueName: string): Promise<AgentQueue | null> {
    try {
      const response = await this.client.get(
        `/distributedtask/queues`,
        // eslint-disable-next-line prettier/prettier
        { params: { queueNames: queueName, 'api-version': '7.1-preview.1' } }
      );
      if (response.data.count > 0) {
        return response.data.value[0] as AgentQueue;
      }
      return null;
    } catch (error) {
      console.error(`Failed to get agent queue by name '${queueName}':`, error);
      throw error;
    }
  }

  public async getVariableGroupByName(groupName: string): Promise<VariableGroup | null> {
    try {
      const response = await this.client.get(
        `/distributedtask/variablegroups`,
        // eslint-disable-next-line prettier/prettier
        { params: { groupName: groupName, 'api-version': '7.1-preview.2' } }
      );
      if (response.data.count > 0) {
        return response.data.value[0] as VariableGroup;
      }
      return null;
    } catch (error) {
      console.error(`Failed to get variable group by name '${groupName}':`, error);
      throw error;
    }
  }

  public async authorizePipelineForAgentPool(pipelineId: number, poolId: number): Promise<void> {
    try {
      const payload = {
        pipelines: [{ id: pipelineId, authorized: true }],
        resource: {
          id: poolId.toString(),
          type: 'queue',
        },
      };
      const response = await this.client.patch(
        `/pipelines/pipelinePermissions/queue/${poolId}?${this.getApiVersionParam()}`,
        payload
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to authorize pipeline ${pipelineId} for agent pool ${poolId}:`, error);
      throw error;
    }
  }

  public async authorizePipelineForVariableGroup(
    pipelineId: number,
    groupId: number
  ): Promise<void> {
    try {
      const payload = {
        pipelines: [{ id: pipelineId, authorized: true }],
        resource: {
          id: groupId.toString(),
          type: 'variablegroup',
        },
      };
      const response = await this.client.patch(
        `/pipelines/pipelinePermissions/variablegroup/${groupId}?${this.getApiVersionParam()}`,
        payload
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to authorize pipeline ${pipelineId} for variable group ${groupId}:`,
        error
      );
      throw error;
    }
  }
}

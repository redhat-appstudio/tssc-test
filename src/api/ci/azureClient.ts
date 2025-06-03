import axios, { AxiosError, AxiosInstance } from 'axios';

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

export class AzureClient {
  private client: AxiosInstance;
  private host: string;
  private organization: string;
  private project: string;
  private apiVersion: string;

  constructor(config: AzurePipelinesClientConfig) {
    this.host = config.host;
    this.organization = config.organization;
    this.project = config.project;
    this.apiVersion = config.apiVersion || '7.0';

    const base64Pat = Buffer.from(`:${config.pat}`).toString('base64');

    this.client = axios.create({
      baseURL: `${this.host}/${this.organization}/${this.project}/_apis`,
      headers: {
        Authorization: `Basic ${base64Pat}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
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

  private getApiVersion(param: string = 'api-version'): string {
    return `${param}=${this.apiVersion}`;
  }

  public async getPipelineDefinition(pipelineId: string): Promise<AzurePipelineDefinition> {
    try {
      const requestPath = `pipelines/${pipelineId}?${this.getApiVersion()}`;
      const response = await this.client.get(requestPath);

      return response.data as AzurePipelineDefinition;
    } catch (error) {
      console.error(`Failed to get pipeline definition '${pipelineId}':`, error);
      throw error;
    }
  }

  public async getPipelineRun(
    pipelineId: number | string,
    runId: number | string
  ): Promise<AzurePipelineRun> {
    try {
      const response = await this.client.get(
        `pipelines/${pipelineId}/runs/${runId}?${this.getApiVersion()}`
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

  public async listPipelineRuns(
    pipelineId: number | string,
    options: ListPipelineRunsOptions = {}
  ): Promise<AzurePipelineRun[]> {
    try {
      const paramMappings: Array<{
        optionKey: keyof ListPipelineRunsOptions;
        apiKey: string;
        transform?: (value: any) => string;
      }> = [
        { optionKey: 'top', apiKey: '$top', transform: v => v.toString() },
        { optionKey: 'statusFilter', apiKey: 'statusFilter' },
        { optionKey: 'resultFilter', apiKey: 'resultFilter' },
        { optionKey: 'reasonFilter', apiKey: 'reasonFilter' },
        {
          optionKey: 'branchName',
          apiKey: 'branchName',
          transform: v => (v.startsWith('refs/') ? v : `refs/heads/${v}`),
        },
        { optionKey: 'queryOrder', apiKey: 'queryOrder' },
        { optionKey: 'minTime', apiKey: 'minFinishTime' },
        { optionKey: 'maxTime', apiKey: 'maxFinishTime' },
        { optionKey: 'repositoryId', apiKey: 'repositoryId' },
        { optionKey: 'sourceVersion', apiKey: 'sourceVersion' },
        { optionKey: 'tags', apiKey: 'tags' },
      ];

      const params = new URLSearchParams();
      params.append(this.getApiVersion().split('=')[0], this.getApiVersion().split('=')[1]);

      for (const mapping of paramMappings) {
        const optionValue = options[mapping.optionKey];
        if (optionValue !== undefined && optionValue !== null) {
          const apiValue = mapping.transform ? mapping.transform(optionValue) : String(optionValue);
          params.append(mapping.apiKey, apiValue);
        }
      }

      const response = await this.client.get(`pipelines/${pipelineId}/runs`, { params });
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
}

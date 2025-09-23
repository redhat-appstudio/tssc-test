import axios, { AxiosError, AxiosInstance } from 'axios';
import retry from 'async-retry';

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
  log?: {
    type: string;
    url: string;
  };
  variables?: { [key: string]: { value: string } | undefined };
}

export interface AzurePipelineRunLogOptions {
  id: number;
  url: string;
  signedContent?: {
    url: string;
    signatureExpires: string;
  }
  createdOn: string;
  lastChangedOn: string;
  lineCount: string;
}

export interface AzureBuild {
  id: number;
  buildNumber: string;
  status: 'succeeded' | 'failed' | 'inProgress' | 'stopped' | 'notStarted';
  reason: 'manual' | 'individualCI' | 'pullRequest' | string;
  startTime: string;
  finishTime: string;
  url: string;
  log?: {
    type: string;
    url: string;
  };
  sourceGetVersion?: string;
  triggerInfo?: {
    'ci.sourceSha'?: string;
    'pr.pullRequestId'?: string;
  };
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

export interface ServiceEndpoint {
  id: string;
  name: string;
  type: string;
  url: string;
  owner: string;
}

export class AzureClient {
  private client: AxiosInstance;
  private host: string;
  private organization: string;
  private project: string;
  private apiVersion: string;
  private authHeader: string;

  constructor(config: AzurePipelinesClientConfig) {
    this.host = config.host;
    this.organization = config.organization;
    this.project = config.project;
    this.apiVersion = config.apiVersion || '7.1-preview.1';

    const base64Pat = Buffer.from(`:${config.pat}`).toString('base64');
    this.authHeader = `Basic ${base64Pat}`;
    this.client = axios.create({
      baseURL: `https://${this.host}/${this.organization}/`,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    // Interceptors for debugging purposes
    this.client.interceptors.request.use(
      request => {
        console.log(
          `[Request] > Sending ${request.method?.toUpperCase()} to ${request.baseURL}${request.url}`
        );
        return request;
      },
      error => {
        console.error('[Request Error]', error);
        return Promise.reject(error);
      }
    );

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

  public async getProjectIdByName(projectName: string): Promise<string> {
    try {
      const response = await this.client.get(
        `/_apis/projects/${projectName}?${this.getApiVersionParam()}`
      );
      return response.data.id;
    } catch (error) {
      console.error(`Failed to get project ID for project '${projectName}':`, error);
      throw error;
    }
  }

  public async getPipelineDefinition(
    pipelineName: string
  ): Promise<AzurePipelineDefinition | null> {
    try {
      const listResponse = await this.client.get(
        `${this.project}/_apis/pipelines?${this.getApiVersionParam()}`
      );
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

  public async getPipelineRun(pipelineId: number, runId: number): Promise<AzurePipelineRun> {
    try {
      const response = await this.client.get(
        `${this.project}/_apis/pipelines/${pipelineId}/runs/${runId}?${this.getApiVersionParam()}`
      );
      const runInfo = response.data as AzurePipelineRun;

      return runInfo;
    } catch (error) {
      console.error(`Failed to get pipeline run ID ${runId} for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  public async getPipelineRunLogInfo(pipelineId: number, runId: number): Promise<AzurePipelineRunLogOptions[]> {
    try {
      const logsResponse = await this.client.get(
        `${this.project}/_apis/pipelines/${pipelineId}/runs/${runId}/logs?$expand=signedContent&${this.getApiVersionParam()}`
      );
      const logs = logsResponse.data.logs as AzurePipelineRunLogOptions[] | [];

      if (!logs || logs.length === 0) {
        console.error(`No logs available for pipeline run #${pipelineId}-${runId}`);
        throw new Error;
      }
      return logs;
    } catch (error) {
      console.error(`Failed to get logs info for pipeline run ID ${runId} for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  public async getPipelineRunLogsFromLogId(pipelineRunID: string, logId: number, signedLogUrl: string): Promise<string> {
    const logHeader = `--- Log: ${logId} ---`;
    try {
      return await retry(
        async (_, attempt) => {
          try {
            // Use axios directly to bypass client interceptors (no logging)
            const logContentResponse = await axios.get(signedLogUrl, {
              headers: {
                'Accept': 'text/plain',
                Authorization: this.authHeader,
              },
              transformResponse: [data => data], // Keep raw response
            });

            if (!logContentResponse.data) {
              console.error(
                `Got empty log content on attempt ${attempt} for log ${logId}, will retry if attempts remain`
              );
              throw new Error('Empty log content received');
            }

            return `${logHeader}\n${String(logContentResponse.data)}\n`;
          } catch (error) {
            // Throw error to trigger retry mechanism
            throw error;
          }
        },
        {
          retries: 5,
          minTimeout: 5000,
          maxTimeout: 15000,
          onRetry: (error: Error, attempt: number) => {
            console.log(
              `[AZURE-RETRY ${attempt}/6] 🔄 Pipeline: ${pipelineRunID}, Log: ${logId} | Status: Failed | Reason: ${error.message}`
            );
          },
        });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === 'Empty log content received') {
        console.warn(
          `Log ${logId} for pipeline run ${pipelineRunID} has empty content after multiple retries. Continuing without its content.`
        );
        return `${logHeader}\nLog is empty\n`;
      }
      console.error(
        `Failed to get log ${logId} for pipeline run ${pipelineRunID} after multiple retries:`,
        error
      );
      return `${logHeader}\nFailed to retrieve log ${logId}: ${errorMessage}\n`;
    }
  }

  public async getPipelineRunLogs(pipelineId: number, runId: number): Promise<string> {
    try {
      const allLogs = await this.getPipelineRunLogInfo(pipelineId, runId);

      // Sort logs by ID to ensure chronological order
      const sortedLogs = allLogs.sort((a: AzurePipelineRunLogOptions, b:AzurePipelineRunLogOptions) => a.id - b.id);

      // Process all logs in parallel using Promise.allSettled for better error handling
      const logPromises = sortedLogs.map((log) => {
        if (!log.signedContent?.url) {
          console.error(
            `Log Info for pipeline ${pipelineId}-${runId} is missing an log url. Skipping Log for ${log.id}`,
          );
          return Promise.resolve('');
        }
        return this.getPipelineRunLogsFromLogId(`${pipelineId}-${runId}`, log.id, log.signedContent!.url)
      });

      // Wait for all log requests to complete
      const logResults = await Promise.all(logPromises);
      return logResults.join('');
    } catch (error) {
      console.error(`Failed to get logs for pipeline run ID ${runId} for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  public async getBuild(buildId: number): Promise<AzureBuild> {
    try {
      const response = await this.client.get(
        `${this.project}/_apis/build/builds/${buildId}?${this.getApiVersionParam()}`
      );
      const runInfo = response.data as AzureBuild;

      return runInfo;
    } catch (error) {
      console.error(`Failed to get build with id ${buildId}:`, error);
      throw error;
    }
  }

  private async getAllPipelines(): Promise<AzurePipelineDefinition[]> {
    try {
      const pipelines = await this.client.get(
        `${this.project}/_apis/pipelines?${this.getApiVersionParam()}`
      );
      return pipelines.data.value;
    } catch (error) {
      console.log(`Failed to retrieve all pipelines`, error);
      throw error;
    }
  }

  public async getPipelineIdByName(pipelineName: string): Promise<number | null> {
    console.log(`Retrieving id for pipeline with name ${pipelineName}`);
    const pipelines = await this.getAllPipelines();

    const pipeline = pipelines.find(pipeline => pipeline.name === pipelineName);

    return pipeline === undefined ? null : pipeline.id;
  }

  public async listPipelineRuns(pipelineId: number): Promise<AzurePipelineRun[]> {
    try {
      console.log(`Listing all pipelineruns for pipeline with id ${pipelineId}`);

      const response = await this.client.get(
        `${this.project}/_apis/pipelines/${pipelineId}/runs?${this.getApiVersionParam()}`
      );
      console.log(`Found ${response.data.count} total runs for pipeline with id ${pipelineId}`);
      return (response.data.value || []) as AzurePipelineRun[];
    } catch (error) {
      console.error(`Failed to list runs for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  public async createPipelineDefinition(
    pipelineName: string,
    repositoryId: string,
    repositoryType: string,
    yamlFilePath: string,
    serviceConnectionId: string,
    folderPath?: string
  ): Promise<AzurePipelineDefinition> {
    console.log(`${repositoryId} ${repositoryType} ${pipelineName}`);
    try {
      const payload = {
        folder: folderPath,
        name: pipelineName,
        triggers: [
          {
            triggerType: 'pullRequest',
            status: 'disabled',
          },
        ],
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

      const response = await this.client.post(
        `${this.project}/_apis/pipelines?${this.getApiVersionParam()}`,
        payload
      );

      await this.disablePipelineTriggerOverride(response.data.id);
      return response.data as AzurePipelineDefinition;
    } catch (error) {
      console.error(`Failed to create pipeline definition '${pipelineName}':`, error);
      throw error;
    }
  }

  public async deletePipeline(pipelineId: number): Promise<void> {
    try {
      await this.client.delete(
        `${this.project}/_apis/pipelines/${pipelineId}?${this.getApiVersionParam()}`
      );
      console.log(`Successfully deleted modern pipeline with ID: ${pipelineId}`);
    } catch (error) {
      console.error(`Failed to delete modern pipeline with ID ${pipelineId}:`, error);
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
        `${this.project}/_apis/distributedtask/variablegroups?${this.getApiVersionParam()}`,
        payload
      );
      console.log(`AzureCI group creation response: ${response.data}`);
    } catch (error) {
      console.error(`Failed to create variable group '${groupName}':`, error);
      throw error;
    }
  }

  public async getAgentQueueByName(queueName: string): Promise<AgentQueue | null> {
    console.log(`Retrieving agent pool with name: ${queueName}`);
    try {
      const response = await this.client.get(
        `${this.project}/_apis/distributedtask/queues`,
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
    console.log(`Retrieving variable group with name: ${groupName}`);
    try {
      const response = await this.client.get(
        `${this.project}/_apis/distributedtask/variablegroups`,
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
        `${this.project}/_apis/pipelines/pipelinePermissions/queue/${poolId}?${this.getApiVersionParam()}`,
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
        `${this.project}/_apis/pipelines/pipelinePermissions/variablegroup/${groupId}?${this.getApiVersionParam()}`,
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

  public async createServiceEndpoint(
    name: string,
    type: string,
    url: string,
    gitToken: string,
    projectId: string
  ): Promise<ServiceEndpoint> {
    try {
      const payload = {
        name: name,
        type: type,
        url: url,
        authorization: {
          scheme: 'PersonalAccessToken',
          parameters: {
            accessToken: gitToken,
          },
        },
        isShared: false,
        serviceEndpointProjectReferences: [
          {
            projectReference: {
              id: projectId,
              name: this.project,
            },
            name: name,
          },
        ],
      };

      const response = await this.client.post(
        `${this.project}/_apis/serviceendpoint/endpoints?${this.getApiVersionParam()}`,
        payload
      );

      return response.data as ServiceEndpoint;
    } catch (error) {
      console.error(`Failed to create service connection '${name}':`, error);
      throw error;
    }
  }

  public async listServiceEndpoints(): Promise<ServiceEndpoint[]> {
    try {
      const response = await this.client.get(
        `${this.project}/_apis/serviceendpoint/endpoints?${this.getApiVersionParam()}`
      );
      return (response.data.value || []) as ServiceEndpoint[];
    } catch (error) {
      console.error(`Failed to retrieve service connections for project '${this.project}':`, error);
      throw error;
    }
  }

  public async getServiceEndpointByName(connectionName: string): Promise<ServiceEndpoint | null> {
    try {
      const allEndpoints = await this.listServiceEndpoints();
      const endpoint = allEndpoints.find(e => e.name === connectionName);
      return endpoint || null;
    } catch (error) {
      console.error(`Error finding service connection by name '${connectionName}':`, error);
      throw error;
    }
  }

  public async deleteVariableGroup(groupId: number, projectId: string): Promise<void> {
    try {
      const deleteUrl = `/_apis/distributedtask/variablegroups/${groupId}?projectIds=${projectId}&api-version=7.1-preview.2`;

      await this.client.delete(deleteUrl);

      console.log(`Successfully deleted variable group with ID: ${groupId}`);
    } catch (error) {
      console.error(`Failed to delete variable group with ID ${groupId}:`, error);
      throw error;
    }
  }

  public async deleteServiceEndpoint(endpointId: string, projectId: string): Promise<void> {
    try {
      await this.client.delete(
        `/_apis/serviceendpoint/endpoints/${endpointId}?projectIds=${projectId}&api-version=7.1-preview.4`
      );

      console.log(`Successfully deleted service connection with ID: ${endpointId}`);
    } catch (error) {
      console.error(`Failed to delete service connection with ID ${endpointId}:`, error);
      throw error;
    }
  }

  public async disablePipelineTriggerOverride(pipelineId: number): Promise<void> {
    const definitionUrl = `/${this.project}/_apis/build/definitions/${pipelineId}?api-version=7.1-preview.7`;

    try {
      const response = await this.client.get(definitionUrl);
      const existingDefinition = response.data;

      existingDefinition.triggers = [
        {
          settingsSourceType: 2, // 2 = Use trigger from YAML file.
          triggerType: 'continuousIntegration',
          batchChanges: false,
          branchFilters: [],
          pathFilters: [],
        },
        {
          settingsSourceType: 2, // 2 = Use trigger from YAML file.
          triggerType: 'pullRequest',
          batchChanges: false,
          branchFilters: [],
          pathFilters: [],
        },
      ];

      console.log(`Updating trigger settings for pipeline ID: ${pipelineId}...`);
      const updateResponse = await this.client.put(definitionUrl, existingDefinition);

      console.log(`Successfully updated trigger for pipeline "${updateResponse.data.name}".`);
    } catch (error) {
      console.error(`Failed to update trigger for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }
}

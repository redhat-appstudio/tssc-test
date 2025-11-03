import { AzureHttpClient } from '../http/azure-http.client';
import {
  AzurePipelineDefinition,
  AzurePipelineRun,
  AzurePipelineRunLogOptions,
  AzureBuild,
} from '../types/azure.types';
import retry from 'async-retry';
import axios from 'axios';

export class AzurePipelineService {
  private readonly client: AzureHttpClient;
  private readonly project: string;
  private readonly apiVersion: string;

  constructor(client: AzureHttpClient, project: string, apiVersion: string) {
    this.client = client;
    this.project = project;
    this.apiVersion = apiVersion;
  }

  private getApiVersionParam(): string {
    return `api-version=${this.apiVersion}`;
  }

  public async getPipelineDefinition(
    pipelineName: string
  ): Promise<AzurePipelineDefinition | null> {
    try {
      const listResponse = await this.client.get<{ value: AzurePipelineDefinition[] }>(
        `${this.project}/_apis/pipelines?${this.getApiVersionParam()}`
      );
      const allPipelines = listResponse.value;
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
      const runInfo = await this.client.get(
        `${this.project}/_apis/pipelines/${pipelineId}/runs/${runId}?${this.getApiVersionParam()}`
      );
      return runInfo as AzurePipelineRun;
    } catch (error) {
      console.error(`Failed to get pipeline run ID ${runId} for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }

  public async getPipelineRunLogInfo(pipelineId: number, runId: number): Promise<AzurePipelineRunLogOptions[]> {
    try {
      const logsResponse = await this.client.get<{ logs: AzurePipelineRunLogOptions[] }>(
        `${this.project}/_apis/pipelines/${pipelineId}/runs/${runId}/logs?$expand=signedContent&${this.getApiVersionParam()}`
      );
      const logs = logsResponse.logs;

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
                Authorization: this.client.getAuthHeader(),
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
      const runInfo = await this.client.get(
        `${this.project}/_apis/build/builds/${buildId}?${this.getApiVersionParam()}`
      );
      return runInfo as AzureBuild;
    } catch (error) {
      console.error(`Failed to get build with id ${buildId}:`, error);
      throw error;
    }
  }

  public async cancelBuild(buildId: number): Promise<void> {
    try {
      await retry(
        async () => {
          await this.client.patch(
            `${this.project}/_apis/build/builds/${buildId}?${this.getApiVersionParam()}`,
            { status: 'cancelling' }
          );
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          onRetry: (error: Error, attempt: number) => {
            console.log(`[Azure] Retry ${attempt}/3 - Cancelling build ${buildId}: ${error.message}`);
          },
        }
      );

      console.log(`[Azure] Successfully cancelled build ${buildId}`);
    } catch (error: any) {
      // Handle specific error cases
      if (error.response?.status === 404) {
        throw new Error(`Build ${buildId} not found`);
      }
      if (error.response?.status === 403) {
        throw new Error(`Insufficient permissions to cancel build ${buildId}`);
      }
      if (error.response?.status === 400) {
        throw new Error(`Build ${buildId} cannot be cancelled (already completed or not cancellable)`);
      }
      throw new Error(`Failed to cancel build ${buildId}: ${error.message}`);
    }
  }

  public async getAllPipelines(): Promise<AzurePipelineDefinition[]> {
    try {
      const pipelines = await this.client.get<{ value: AzurePipelineDefinition[] }>(
        `${this.project}/_apis/pipelines?${this.getApiVersionParam()}`
      );
      return pipelines.value;
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

      const response = await this.client.get<{ count: number; value: AzurePipelineRun[] }>(
        `${this.project}/_apis/pipelines/${pipelineId}/runs?${this.getApiVersionParam()}`
      );
      console.log(`Found ${response.count} total runs for pipeline with id ${pipelineId}`);
      return response.value || [];
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

      const response = await this.client.post<AzurePipelineDefinition>(
        `${this.project}/_apis/pipelines?${this.getApiVersionParam()}`,
        payload
      );

      await this.disablePipelineTriggerOverride(response.id);
      return response;
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

  public async disablePipelineTriggerOverride(pipelineId: number): Promise<void> {
    const definitionUrl = `${this.project}/_apis/build/definitions/${pipelineId}?${this.getApiVersionParam()}`;

    try {
      const existingDefinition = await this.client.get<any>(definitionUrl);

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
      const updateResponse = await this.client.put<AzurePipelineDefinition>(definitionUrl, existingDefinition);

      console.log(`Successfully updated trigger for pipeline "${updateResponse.name}".`);
    } catch (error) {
      console.error(`Failed to update trigger for pipeline ID ${pipelineId}:`, error);
      throw error;
    }
  }
}
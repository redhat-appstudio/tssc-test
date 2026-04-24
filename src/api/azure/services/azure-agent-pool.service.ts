import retry from 'async-retry';
import { AzureHttpClient } from '../http/azure-http.client';
import { AgentQueue } from '../types/azure.types';
import { AzureApiError } from '../errors/azure.errors';
import { AZURE_API_VERSIONS } from '../constants/api-versions';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class AzureAgentPoolService {
  private readonly client: AzureHttpClient;
  private readonly project: string;
  private readonly apiVersion: string;
  private readonly logger: Logger;

  constructor(client: AzureHttpClient, project: string, apiVersion: string) {
    this.client = client;
    this.project = project;
    this.apiVersion = apiVersion;
    this.logger = LoggerFactory.getLogger('azure.agent-pool');
  }

  private getApiVersionParam(): string {
    return `api-version=${this.apiVersion}`;
  }

  public async getAgentQueueByName(queueName: string): Promise<AgentQueue | null> {
    this.logger.info(`Retrieving agent pool with name: ${queueName}`);
    try {
      const response = await this.client.get<{ count: number; value: AgentQueue[] }>(
        `${this.project}/_apis/distributedtask/queues?${this.getApiVersionParam()}`,
        { params: { queueName: queueName } }
      );
      if (response.count > 0) {
        return response.value[0];
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get agent queue by name '${queueName}': ${error}`);
      throw error;
    }
  }

  public async authorizePipelineForAgentPool(pipelineId: number, poolId: number): Promise<void> {
    try {
      await retry(
        async (bail) => {
          try {
            const payload = {
              pipelines: [{ id: pipelineId, authorized: true }],
              resource: {
                id: poolId.toString(),
                type: 'queue',
              },
            };
            await this.client.patch(
              `${this.project}/_apis/pipelines/pipelinePermissions/queue/${poolId}?api-version=${AZURE_API_VERSIONS.PIPELINE_PERMISSIONS}`,
              payload
            );
          } catch (error) {
            if (error instanceof AzureApiError) {
              const status = error.status;
              const isTransient = !status || status === 408 || status === 429 || status >= 500;
              if (!isTransient) {
                bail(error);
                return;
              }
            }
            throw error;
          }
        },
        {
          retries: 2,
          minTimeout: 5000,
          maxTimeout: 15000,
          onRetry: (error: unknown, attempt: number) => {
            const status = error instanceof AzureApiError ? error.status : undefined;
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Retry attempt ${attempt}/2 to authorize pipeline ${pipelineId} for agent pool ${poolId}: ${message} (status: ${status})`);
          },
        }
      );
    } catch (error) {
      this.logger.error(`Failed to authorize pipeline ${pipelineId} for agent pool ${poolId} after retries: ${error}`);
      throw error;
    }
  }
}
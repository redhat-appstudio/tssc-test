import { AzureHttpClient } from '../http/azure-http.client';
import { AgentQueue } from '../types/azure.types';
import { AZURE_API_VERSIONS } from '../constants/api-versions';

export class AzureAgentPoolService {
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

  public async getAgentQueueByName(queueName: string): Promise<AgentQueue | null> {
    console.log(`Retrieving agent pool with name: ${queueName}`);
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
      console.error(`Failed to get agent queue by name '${queueName}':`, error);
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
      await this.client.patch(
        `${this.project}/_apis/pipelines/pipelinePermissions/queue/${poolId}?api-version=${AZURE_API_VERSIONS.PIPELINE_PERMISSIONS}`,
        payload
      );
    } catch (error) {
      console.error(`Failed to authorize pipeline ${pipelineId} for agent pool ${poolId}:`, error);
      throw error;
    }
  }
}
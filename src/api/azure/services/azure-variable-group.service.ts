import retry from 'async-retry';
import { AzureHttpClient } from '../http/azure-http.client';
import { VariableGroup } from '../types/azure.types';
import { AzureApiError, isTransientAzureError } from '../errors/azure.errors';
import { AZURE_API_VERSIONS } from '../constants/api-versions';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class AzureVariableGroupService {
  private readonly client: AzureHttpClient;
  private readonly project: string;
  private readonly apiVersion: string;
  private readonly logger: Logger;

  constructor(client: AzureHttpClient, project: string, apiVersion: string) {
    this.client = client;
    this.project = project;
    this.apiVersion = apiVersion;
    this.logger = LoggerFactory.getLogger('azure.variable-group');
  }

  private getApiVersionParam(): string {
    return `api-version=${this.apiVersion}`;
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
      this.logger.info(`AzureCI group creation response: ${JSON.stringify(response)}`);
    } catch (error) {
      this.logger.error(`Failed to create variable group '${groupName}': ${error}`);
      throw error;
    }
  }

  public async getVariableGroupByName(groupName: string): Promise<VariableGroup | null> {
    this.logger.info(`Retrieving variable group with name: ${groupName}`);
    try {
      const response = await this.client.get<{ count: number; value: VariableGroup[] }>(
        `${this.project}/_apis/distributedtask/variablegroups?${this.getApiVersionParam()}`,
        { params: { groupName: groupName } }
      );
      if (response.count > 0) {
        return response.value[0];
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get variable group by name '${groupName}': ${error}`);
      throw error;
    }
  }

  public async authorizePipelineForVariableGroup(
    pipelineId: number,
    groupId: number
  ): Promise<void> {
    try {
      await retry(
        async (bail) => {
          try {
            const payload = {
              pipelines: [{ id: pipelineId, authorized: true }],
              resource: {
                id: groupId.toString(),
                type: 'variablegroup',
              },
            };
            await this.client.patch(
              `${this.project}/_apis/pipelines/pipelinePermissions/variablegroup/${groupId}?api-version=${AZURE_API_VERSIONS.PIPELINE_PERMISSIONS}`,
              payload
            );
          } catch (error) {
            if (!isTransientAzureError(error)) {
              bail(error as Error);
              return;
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
            this.logger.warn(`Retry attempt ${attempt}/2 to authorize pipeline ${pipelineId} for variable group ${groupId}: ${message} (status: ${status})`);
          },
        }
      );
    } catch (error) {
      this.logger.error(`Failed to authorize pipeline ${pipelineId} for variable group ${groupId} after retries: ${error}`);
      throw error;
    }
  }

  public async deleteVariableGroup(groupId: number, projectId: string): Promise<void> {
    try {
      const deleteUrl = `_apis/distributedtask/variablegroups/${groupId}?projectIds=${projectId}&${this.getApiVersionParam()}`;

      await this.client.delete(deleteUrl);

      this.logger.info(`Successfully deleted variable group with ID: ${groupId}`);
    } catch (error) {
      this.logger.error(`Failed to delete variable group with ID ${groupId}: ${error}`);
      throw error;
    }
  }
}
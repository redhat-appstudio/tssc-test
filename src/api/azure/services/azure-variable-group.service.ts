import { AzureHttpClient } from '../http/azure-http.client';
import { VariableGroup } from '../types/azure.types';
import { AZURE_API_VERSIONS } from '../constants/api-versions';

export class AzureVariableGroupService {
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
      console.log(`AzureCI group creation response: ${response}`);
    } catch (error) {
      console.error(`Failed to create variable group '${groupName}':`, error);
      throw error;
    }
  }

  public async getVariableGroupByName(groupName: string): Promise<VariableGroup | null> {
    console.log(`Retrieving variable group with name: ${groupName}`);
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
      console.error(`Failed to get variable group by name '${groupName}':`, error);
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
      await this.client.patch(
        `${this.project}/_apis/pipelines/pipelinePermissions/variablegroup/${groupId}?api-version=${AZURE_API_VERSIONS.PIPELINE_PERMISSIONS}`,
        payload
      );
    } catch (error) {
      console.error(
        `Failed to authorize pipeline ${pipelineId} for variable group ${groupId}:`,
        error
      );
      throw error;
    }
  }

  public async deleteVariableGroup(groupId: number, projectId: string): Promise<void> {
    try {
      const deleteUrl = `_apis/distributedtask/variablegroups/${groupId}?projectIds=${projectId}&${this.getApiVersionParam()}`;

      await this.client.delete(deleteUrl);

      console.log(`Successfully deleted variable group with ID: ${groupId}`);
    } catch (error) {
      console.error(`Failed to delete variable group with ID ${groupId}:`, error);
      throw error;
    }
  }
}
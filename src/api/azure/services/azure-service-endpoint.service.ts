import { AzureHttpClient } from '../http/azure-http.client';
import { ServiceEndpoint } from '../types/azure.types';

export class AzureServiceEndpointService {
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

      const response = await this.client.post<ServiceEndpoint>(
        `${this.project}/_apis/serviceendpoint/endpoints?${this.getApiVersionParam()}`,
        payload
      );

      return response;
    } catch (error) {
      console.error(`Failed to create service connection '${name}':`, error);
      throw error;
    }
  }

  public async listServiceEndpoints(): Promise<ServiceEndpoint[]> {
    try {
      const response = await this.client.get<{ value: ServiceEndpoint[] }>(
        `${this.project}/_apis/serviceendpoint/endpoints?${this.getApiVersionParam()}`
      );
      return response.value || [];
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

  public async deleteServiceEndpoint(endpointId: string, projectId: string): Promise<void> {
    try {
      await this.client.delete(
        `_apis/serviceendpoint/endpoints/${endpointId}?projectIds=${projectId}&${this.getApiVersionParam()}`
      );

      console.log(`Successfully deleted service connection with ID: ${endpointId}`);
    } catch (error) {
      console.error(`Failed to delete service connection with ID ${endpointId}:`, error);
      throw error;
    }
  }
}
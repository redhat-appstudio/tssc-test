import { AzureHttpClient } from '../http/azure-http.client';

export class AzureProjectService {
  private readonly client: AzureHttpClient;
  private readonly apiVersion: string;

  constructor(client: AzureHttpClient, apiVersion: string) {
    this.client = client;
    this.apiVersion = apiVersion;
  }

  private getApiVersionParam(): string {
    return `api-version=${this.apiVersion}`;
  }

  public async getProjectIdByName(projectName: string): Promise<string> {
    try {
      const response = await this.client.get<{ id: string }>(
        `_apis/projects/${projectName}?${this.getApiVersionParam()}`
      );
      return response.id;
    } catch (error) {
      console.error(`Failed to get project ID for project '${projectName}':`, error);
      throw error;
    }
  }
}
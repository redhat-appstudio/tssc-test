import { AzureHttpClient } from '../http/azure-http.client';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

export class AzureProjectService {
  private readonly client: AzureHttpClient;
  private readonly apiVersion: string;
  private readonly logger: Logger;

  constructor(client: AzureHttpClient, apiVersion: string) {
    this.client = client;
    this.apiVersion = apiVersion;
    this.logger = LoggerFactory.getLogger('azure.project');
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
      this.logger.error('Failed to get project ID for project \'{}\': {}', projectName, error);
      throw error;
    }
  }
}
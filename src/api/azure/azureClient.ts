import { AzureHttpClient, AzureHttpClientConfig } from './http/azure-http.client';
import { AzurePipelineService } from './services/azure-pipeline.service';
import { AzureVariableGroupService } from './services/azure-variable-group.service';
import { AzureAgentPoolService } from './services/azure-agent-pool.service';
import { AzureServiceEndpointService } from './services/azure-service-endpoint.service';
import { AzureProjectService } from './services/azure-project.service';
import { AzurePipelinesClientConfig } from './types/azure.types';
import { AZURE_API_VERSIONS } from './constants/api-versions';
import { LoggerFactory, Logger } from '../../logger/logger';

export class AzureClient {
  public readonly pipelines: AzurePipelineService;
  public readonly variableGroups: AzureVariableGroupService;
  public readonly agentPools: AzureAgentPoolService;
  public readonly serviceEndpoints: AzureServiceEndpointService;
  public readonly projects: AzureProjectService;

  private readonly httpClient: AzureHttpClient;
  private readonly project: string;
  private readonly apiVersion: string;
  private readonly logger: Logger;

  constructor(config: AzurePipelinesClientConfig) {
    this.logger = LoggerFactory.getLogger('azure.client');
    this.project = config.project;
    this.apiVersion = config.apiVersion || AZURE_API_VERSIONS.DEFAULT;

    const httpClientConfig: AzureHttpClientConfig = {
      host: config.host,
      organization: config.organization,
      pat: config.pat,
      timeout: 30000, // 30s default
    };

    this.httpClient = new AzureHttpClient(httpClientConfig);
    this.pipelines = new AzurePipelineService(this.httpClient, this.project, this.apiVersion);
    this.variableGroups = new AzureVariableGroupService(this.httpClient, this.project, this.apiVersion);
    this.agentPools = new AzureAgentPoolService(this.httpClient, this.project, this.apiVersion);
    this.serviceEndpoints = new AzureServiceEndpointService(this.httpClient, this.project, this.apiVersion);
    this.projects = new AzureProjectService(this.httpClient, this.apiVersion);

    this.logger.info('Initialized Azure client', { project: this.project, organization: config.organization, host: config.host, apiVersion: this.apiVersion });
  }
}

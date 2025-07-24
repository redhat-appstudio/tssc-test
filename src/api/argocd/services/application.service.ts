import { KubeClient } from '../../ocp/kubeClient';
import { ApplicationKind } from '../types/application.types';
import {
  ArgoCDApplicationNotFoundError,
  ArgoCDConnectionError,
} from '../errors/argocd.errors';

/**
 * Service for managing ArgoCD applications
 */
export class ArgoCDApplicationService {
  private readonly API_GROUP = 'argoproj.io';
  private readonly API_VERSION = 'v1alpha1';
  private readonly APPLICATIONS_PLURAL = 'applications';

  constructor(private readonly kubeClient: KubeClient) {}

  /**
   * Get ArgoCD Application
   */
  public async getApplication(
    applicationName: string,
    namespace: string
  ): Promise<ApplicationKind> {
    try {
      const options = this.kubeClient.createApiOptions(
        this.API_GROUP,
        this.API_VERSION,
        this.APPLICATIONS_PLURAL,
        namespace,
        { name: applicationName }
      );

      const application = await this.kubeClient.getResource<ApplicationKind>(options);

      if (!application) {
        throw new ArgoCDApplicationNotFoundError(applicationName, namespace);
      }

      return application;
    } catch (error) {
      if (error instanceof ArgoCDApplicationNotFoundError) {
        throw error;
      }
      // Handle 404 specifically for application not found
      const statusCode = (error as any)?.response?.statusCode;
      if (statusCode === 404) {
        throw new ArgoCDApplicationNotFoundError(applicationName, namespace);
      }
      console.error(
        `Error retrieving application ${applicationName}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new ArgoCDConnectionError(
        `Failed to get application ${applicationName}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * List all ArgoCD Applications in a namespace
   */
  public async listApplications(
    namespace: string,
    labelSelector?: string
  ): Promise<ApplicationKind[]> {
    try {
      const options = this.kubeClient.createApiOptions(
        this.API_GROUP,
        this.API_VERSION,
        this.APPLICATIONS_PLURAL,
        namespace,
        { ...(labelSelector ? { labelSelector } : {}) }
      );

      const applications = await this.kubeClient.listResources<ApplicationKind>(options);

      return applications || [];
    } catch (error) {
      console.error(
        `Error listing applications in namespace ${namespace}: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Get the status of an ArgoCD application
   */
  public async getApplicationStatus(
    applicationName: string,
    namespace: string
  ): Promise<string> {
    const application = await this.getApplication(applicationName, namespace);
    
    if (!application.status) {
      return 'Status information not available';
    }

    const healthStatus = application.status.health?.status || 'Unknown';
    const syncStatus = application.status.sync?.status || 'Unknown';
    const operationPhase = application.status.operationState?.phase || 'Unknown';
    const reconciledAt = application.status.reconciledAt || 'Unknown';

    let resourcesSummary = '';
    if (application.status.resources && application.status.resources.length > 0) {
      const resourceCount = application.status.resources.length;
      const healthyCount = application.status.resources.filter(
        r => r.health?.status === 'Healthy'
      ).length;

      resourcesSummary = `Resources: ${healthyCount}/${resourceCount} healthy`;
    }

    // Format the status information
    return `Health: ${healthStatus}, Sync: ${syncStatus}, Operation: ${operationPhase}, Last Reconciled: ${reconciledAt}${
      resourcesSummary ? ', ' + resourcesSummary : ''
    }`;
  }

  /**
   * Get health status of an ArgoCD application
   */
  public async getApplicationHealth(
    applicationName: string,
    namespace: string
  ): Promise<string> {
    const application = await this.getApplication(applicationName, namespace);
    return application.status?.health?.status || 'Unknown';
  }

  /**
   * Get sync status of an ArgoCD application
   */
  public async getApplicationSyncStatus(
    applicationName: string,
    namespace: string
  ): Promise<string> {
    const application = await this.getApplication(applicationName, namespace);
    return application.status?.sync?.status || 'Unknown';
  }

  /**
   * Get operation phase of an ArgoCD application
   */
  public async getApplicationOperationPhase(
    applicationName: string,
    namespace: string
  ): Promise<string> {
    const application = await this.getApplication(applicationName, namespace);
    return application.status?.operationState?.phase || 'Unknown';
  }
} 
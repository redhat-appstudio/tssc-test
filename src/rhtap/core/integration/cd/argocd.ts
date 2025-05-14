import { KubeClient } from '../../../../../src/api//ocp/kubeClient';
import { ApplicationKind, ArgoCDClient } from '../../../../../src/api/cd/argocdClient';
import retry from 'async-retry';

// Define environment constants
export enum Environment {
  DEVELOPMENT = 'development',
  STAGE = 'stage',
  PROD = 'prod',
}

export class ArgoCD {
  private argoCDClient: ArgoCDClient;
  private readonly NAMESPACE = 'tssc-gitops';

  constructor(
    public readonly componentName: string,
    public readonly kubeClient: KubeClient
  ) {
    this.argoCDClient = new ArgoCDClient(kubeClient);
  }

  public async getApplication(environment: Environment): Promise<ApplicationKind> {
    const applicationName = this.getApplicationName(environment);
    const application = await this.argoCDClient.getApplication(applicationName, this.NAMESPACE);

    if (!application) {
      throw new Error(`Application ${applicationName} not found`);
    }

    return application;
  }

  public async getApplicationStatus(environment: Environment): Promise<string> {
    const applicationName = this.getApplicationName(environment);
    const application = await this.argoCDClient.getApplication(applicationName, this.NAMESPACE);

    if (!application) {
      throw new Error(`Application ${applicationName} not found`);
    }

    return JSON.stringify(application.status);
  }

  public async getApplicationLogs(environment: Environment): Promise<string> {
    const applicationName = this.getApplicationName(environment);
    const status = await this.argoCDClient.getApplicationStatus(applicationName, this.NAMESPACE);
    if (!status) {
      throw new Error(`Logs for application ${applicationName} not found`);
    }
    return status;
  }

  public async syncApplication(environment: Environment): Promise<void> {
    const applicationName = this.getApplicationName(environment);

    const success = await this.argoCDClient.syncApplication(applicationName, this.NAMESPACE);

    if (!success) {
      throw new Error(`Failed to sync application ${applicationName}`);
    }
  }

  /**
   * Gets the application name for the specified environment.
   * @param environment The target environment
   * @returns The formatted application name for the specified environment
   */
  public getApplicationName(environment: Environment = Environment.DEVELOPMENT): string {
    return `${this.componentName}-${environment}`;
  }

  /**
   * Waits until an application is synced by polling the status
   * @param environment The target environment
   * @param revision The revision that should be synced (default: HEAD)
   * @param maxRetries Maximum number of retry attempts (default: 10)
   * @param retryDelayMs Delay between retries in milliseconds (default: 5000)
   * @returns Promise that resolves with status information
   * @throws Error when the application fails to sync within the maximum retries
   */
  public async waitUntilApplicationIsSynced(
    environment: Environment = Environment.DEVELOPMENT,
    revision: string,
    maxRetries: number = 12,
    retryDelayMs: number = 10000
  ): Promise<{ synced: boolean; status: string; message: string }> {
    let finalSyncStatus = 'Unknown';
    let finalHealthStatus = 'Unknown';
    let finalRevision = '';

    try {
      await retry(
        async () => {
          // Get the application to check its sync status
          const applicationName = this.getApplicationName(environment);
          const application = await this.argoCDClient.getApplication(
            applicationName,
            this.NAMESPACE
          );

          if (!application) {
            throw new Error(`Application ${applicationName} not found`);
          }

          // Store the latest status information
          finalSyncStatus = application.status?.sync?.status || 'Unknown';
          finalHealthStatus = application.status?.health?.status || 'Unknown';
          finalRevision = application.status?.sync?.revision || '';

          // Check all conditions: revision matches, synced status, and healthy status
          const isRevisionMatched = finalRevision === revision;
          const isSynced = finalSyncStatus === 'Synced';
          const isHealthy = finalHealthStatus === 'Healthy';

          if (isSynced && isHealthy && isRevisionMatched) {
            console.log(`Application ${applicationName} is successfully synced and healthy.`);
            console.log(`- Sync Status: ${finalSyncStatus}`);
            console.log(`- Health Status: ${finalHealthStatus}`);
            console.log(`- Revision: ${finalRevision}`);
            return; // Success, don't retry
          }

          // Log which conditions are not met
          const pendingConditions = [];
          if (!isSynced)
            pendingConditions.push(`Sync Status (current: ${finalSyncStatus}, expected: Synced)`);
          if (!isHealthy)
            pendingConditions.push(
              `Health Status (current: ${finalHealthStatus}, expected: Healthy)`
            );
          if (!isRevisionMatched)
            pendingConditions.push(`Revision (current: ${finalRevision}, expected: ${revision})`);

          console.log(
            `Waiting for application ${applicationName} to be fully synced... Pending conditions: ${pendingConditions.join(', ')}`
          );
          // Throw an error to trigger a retry
          throw new Error(
            `Application ${applicationName} is not fully synced yet. Pending conditions: ${pendingConditions.join(', ')}`
          );
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (_, attempt) => {
            console.log(`Attempt ${attempt} failed. ${maxRetries - attempt + 1} attempts left.`);
          },
        }
      );

      // If we reach here, the sync was successful
      return {
        synced: true,
        status: finalSyncStatus,
        message: `${environment} application successfully synced. Health: ${finalHealthStatus}, Revision: ${finalRevision}`,
      };
    } catch (error) {
      // If we reach here, all retries were exhausted
      console.error(`Failed to sync application ${environment} after ${maxRetries} retries:`);
      console.error(error);
      console.error(
        `Final sync status: ${finalSyncStatus}, Health status: ${finalHealthStatus}, Revision: ${finalRevision}`
      );

      // Return detailed information instead of throwing, allowing caller to handle the situation
      return {
        synced: false,
        status: finalSyncStatus,
        message: `${environment} application failed to sync after ${maxRetries} retries. Final status: ${finalSyncStatus}, Health: ${finalHealthStatus}, Revision: ${finalRevision}`,
      };
    }
  }
}

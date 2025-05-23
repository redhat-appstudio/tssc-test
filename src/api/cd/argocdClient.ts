import { KubeClient } from '../../api/ocp/kubeClient';
import { V1ObjectMeta } from '@kubernetes/client-node';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import retry from 'async-retry';

// Promisified exec function
const exec = promisify(execCallback);

/**
 * Common interfaces for ArgoCD Application structure
 */

/**
 * Application resource health status
 */
export interface ApplicationHealthStatus {
  status: string;
  message?: string;
}

/**
 * Application sync status
 */
export interface ApplicationSyncStatus {
  status: string;
  revision: string;
  revisions?: string[];
  comparedTo?: {
    source: ApplicationSource;
    destination: ApplicationDestination;
  };
}

/**
 * Application operation state
 */
export interface ApplicationOperationState {
  phase: string;
  message?: string;
  syncResult?: SyncOperationResult;
  startedAt: string;
  finishedAt?: string;
  operation?: Operation;
  retryCount?: number;
}

/**
 * Sync operation result
 */
export interface SyncOperationResult {
  resources: ResourceResult[];
  revision: string;
  source: ApplicationSource;
}

/**
 * Resource result from a sync operation
 */
export interface ResourceResult {
  group: string;
  version: string;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  message: string;
  hookPhase?: string;
  syncPhase?: string;
}

/**
 * Operation definition
 */
export interface Operation {
  sync?: SyncOperation;
  retry?: RetryStrategy;
  info?: { name: string; value: string }[];
}

/**
 * Sync operation definition
 */
export interface SyncOperation {
  revision: string;
  prune: boolean;
  dryRun: boolean;
  resources?: SyncOperationResource[];
  source?: ApplicationSource;
  syncOptions?: string[];
}

/**
 * Resource to sync
 */
export interface SyncOperationResource {
  group: string;
  kind: string;
  name: string;
  namespace?: string;
}

/**
 * Retry strategy for operations
 */
export interface RetryStrategy {
  limit?: number;
  backoff?: {
    duration?: string;
    factor?: number;
    maxDuration?: string;
  };
}

/**
 * Application resource
 */
export interface ApplicationResource {
  group: string;
  version: string;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  health?: ApplicationHealthStatus;
  hook?: boolean;
  requiresPruning?: boolean;
}

/**
 * Source of an application
 */
export interface ApplicationSource {
  repoURL: string;
  path?: string;
  targetRevision?: string;
  chart?: string;
  helm?: {
    parameters?: { name: string; value: string }[];
    values?: string;
    fileParameters?: { name: string; path: string }[];
    valueFiles?: string[];
  };
  kustomize?: {
    namePrefix?: string;
    nameSuffix?: string;
    images?: string[];
    commonLabels?: { [key: string]: string };
    version?: string;
  };
  directory?: {
    recurse: boolean;
    jsonnet?: {
      extVars?: { name: string; value: string }[];
      tlas?: { name: string; value: string }[];
    };
  };
  plugin?: {
    name: string;
    env?: { name: string; value: string }[];
  };
}

/**
 * Destination of an application deployment
 */
export interface ApplicationDestination {
  server: string;
  namespace: string;
  name?: string;
}

/**
 * Application status
 */
export interface ApplicationStatus {
  observedAt?: string;
  resources: ApplicationResource[];
  health: ApplicationHealthStatus;
  sync: ApplicationSyncStatus;
  history?: RevisionHistory[];
  conditions?: ApplicationCondition[];
  reconciledAt?: string;
  operationState?: ApplicationOperationState;
  sourceType?: string;
  summary?: {
    images?: string[];
    externalURLs?: string[];
  };
}

/**
 * Revision history entry
 */
export interface RevisionHistory {
  revision: string;
  deployedAt: string;
  id: number;
  source: ApplicationSource;
}

/**
 * Application condition
 */
export interface ApplicationCondition {
  type: string;
  message: string;
  lastTransitionTime?: string;
  status: string;
}

/**
 * Application specification
 */
export interface ApplicationSpec {
  source: ApplicationSource;
  destination: ApplicationDestination;
  project: string;
  syncPolicy?: {
    automated?: {
      prune: boolean;
      selfHeal: boolean;
      allowEmpty?: boolean;
    };
    syncOptions?: string[];
    retry?: RetryStrategy;
  };
  ignoreDifferences?: {
    group: string;
    kind: string;
    name?: string;
    namespace?: string;
    jsonPointers?: string[];
    jqPathExpressions?: string[];
  }[];
  info?: { name: string; value: string }[];
  revisionHistoryLimit?: number;
  operation?: Operation;
}

/**
 * Full ArgoCD Application resource
 */
export interface ApplicationKind {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta;
  spec: ApplicationSpec;
  status?: ApplicationStatus;
}

/**
 * Interface for ArgoCD server connection information
 */
export interface ArgoCDConnectionInfo {
  serverUrl: string;
  username: string;
  password: string;
}

/**
 * Main ArgoCD client implementation
 */
export class ArgoCDClient {
  private readonly API_GROUP = 'argoproj.io';
  private readonly API_VERSION = 'v1alpha1';
  private readonly APPLICATIONS_PLURAL = 'applications';
  private readonly ARGOCD_PLURAL = 'argocds';

  constructor(private kubeClient: KubeClient) {}

  /**
   * Gets the name of the ArgoCD instance in the specified namespace.
   */
  public async getArgoCDInstanceName(namespace: string): Promise<string> {
    const options = this.kubeClient.createApiOptions(
      this.API_GROUP,
      this.API_VERSION,
      this.ARGOCD_PLURAL,
      namespace
    );

    const instances = await this.kubeClient.listResources<any>(options);

    if (!instances || instances.length === 0) {
      throw new Error(`No ArgoCD instance found in namespace ${namespace}`);
    }

    const instanceName = instances[0]?.metadata?.name;
    if (!instanceName) {
      throw new Error(`ArgoCD instance found but name is missing in namespace ${namespace}`);
    }

    return instanceName;
  }

  /**
   * Gets the ArgoCD server route for the specified instance.
   */
  public async getArgoCDServerRoute(namespace: string, instanceName: string): Promise<string> {
    try {
      const route = this.kubeClient.getOpenshiftRoute(`${instanceName}-server`, namespace);
      if (!route) {
        throw new Error(`No route found for ArgoCD server in namespace ${namespace}`);
      }
      return route;
    } catch (error) {
      throw new Error(
        `No route found for ArgoCD server in namespace ${namespace}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Gets the ArgoCD admin password for the specified instance.
   */
  public async getArgoCDAdminPassword(namespace: string, instanceName: string): Promise<string> {
    const secret = await this.kubeClient.getSecret(`${instanceName}-cluster`, namespace);

    const password = secret['admin.password'];
    if (!password) {
      throw new Error(
        `No admin password found in secret ${instanceName}-cluster in namespace ${namespace}`
      );
    }

    return password;
  }

  /**
   * Gets complete connection information for ArgoCD in the specified namespace.
   */
  public async getArgoCDConnectionInfo(namespace: string): Promise<ArgoCDConnectionInfo> {
    try {
      // Get instance name
      const instanceName = await this.getArgoCDInstanceName(namespace);

      // Get server URL
      const serverUrl = await this.getArgoCDServerRoute(namespace, instanceName);

      // Get admin password
      const password = await this.getArgoCDAdminPassword(namespace, instanceName);

      return {
        serverUrl,
        username: 'admin',
        password,
      };
    } catch (error) {
      throw new Error(
        `Error retrieving ArgoCD connection info: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get ArgoCD Application
   */
  public async getApplication(
    applicationName: string,
    namespace: string
  ): Promise<ApplicationKind | null> {
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
        throw new Error(
          `Failed to get ArgoCD application ${applicationName} in namespace ${namespace}`
        );
      }

      return application;
    } catch (error) {
      console.error(
        `Error retrieving application ${applicationName}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
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
   * Triggers and monitors a synchronization operation for an ArgoCD application using the ArgoCD CLI.
   * This implementation is inspired by TektonCI's waitForAllPipelinesToFinish, providing robust retry
   * logic to not only start the sync but also wait for it to complete successfully.
   * 
   * @param applicationName The name of the ArgoCD application to sync
   * @param namespace The namespace where the ArgoCD instance is running
   * @param timeoutMs Optional timeout in milliseconds (default: 10 minutes)
   * @returns Promise<boolean> True if sync completed successfully, false otherwise
   */
  public async syncApplication(
    applicationName: string, 
    namespace: string, 
    timeoutMs: number = 4 * 60 * 1000
  ): Promise<boolean> {
    if (!applicationName || !namespace) {
      console.error('Application name and namespace are required parameters');
      return false;
    }

    console.log(`Starting sync process for application ${applicationName} in namespace ${namespace}...`);
    const startTime = Date.now();

    try {
      // Get ArgoCD connection info
      const connectionInfo = await this.getArgoCDConnectionInfo(namespace);
      const { serverUrl, username, password } = connectionInfo;

      // Build ArgoCD CLI commands
      const loginCmd = `argocd login ${serverUrl} --insecure --grpc-web --username ${username} --password "${password}"`;
      const syncCmd = `argocd app sync ${applicationName} --insecure`;

      console.log(`Attempting to sync application ${applicationName} using ArgoCD CLI...`);

      // Execute login command with retries
      const maxRetries = 5;
      await retry(
        async () => {
          try {
            const { stdout: _, stderr: loginErr } = await exec(loginCmd);
            if (loginErr && loginErr.trim()) {
              console.warn(`ArgoCD login warnings: ${loginErr}`);
            }
            console.log(`Successfully logged into ArgoCD server at ${serverUrl}`);
          } catch (loginError: any) {
            console.error(`Error logging into ArgoCD: ${loginError.message}`);
            throw new Error(`Failed to login to ArgoCD: ${loginError.message}`);
          }
        },
        {
          retries: maxRetries, 
          minTimeout: 2000, // Start with 2 seconds between retries
          factor: 2,
          onRetry: (error: Error, attempt: number) => {
            console.log(`[LOGIN-RETRY ${attempt}/${maxRetries}] 🔄 Application: ${applicationName} | Status: Retrying login | Reason: ${error.message}`);
          }
        }
      );

      // Execute sync command
      try {
        console.log(`Executing sync command: ${syncCmd}`);
        const { stdout, stderr } = await exec(syncCmd);

        if (stderr && stderr.trim()) {
          console.warn(`ArgoCD sync warnings: ${stderr}`);
        }
        if (stdout) {
          console.log(`ArgoCD sync output: ${stdout}`);
        }

        // Define the application sync monitoring function that will be retried
        const monitorSyncProcess = async (bail: (e: Error) => void): Promise<boolean> => {
          // Check if we've exceeded the timeout
          if (Date.now() - startTime > timeoutMs) {
            const message = `Timeout reached after ${Math.round((timeoutMs) / 1000 / 60)} minutes waiting for application ${applicationName} to sync`;
            console.error(message);
            bail(new Error(message));
            return false;
          }
          
          // Get current application status
          const healthStatus = await this.getApplicationHealth(applicationName, namespace);
          const syncStatus = await this.getApplicationSyncStatus(applicationName, namespace);
          const operationPhase = await this.getApplicationOperationPhase(applicationName, namespace);
          
          // Check for success condition - health is Healthy and sync status is Synced
          if (healthStatus === 'Healthy' && syncStatus === 'Synced') {
            console.log(`✅ Sync completed successfully for application ${applicationName} - Health: ${healthStatus}, Sync: ${syncStatus}`);
            return true;
          }
          
          // Check for clear failure cases and bail immediately
          if (healthStatus === 'Degraded' || syncStatus === 'SyncFailed' || operationPhase === 'Failed' || operationPhase === 'Error') {
            const errorMessage = `Sync failed for application ${applicationName} - Health: ${healthStatus}, Sync: ${syncStatus}, Operation: ${operationPhase}`;
            console.error(errorMessage);
            bail(new Error(errorMessage));
            return false;
          }
          
          // Still in progress, throw error to trigger retry
          const statusMsg = `Application ${applicationName} - Health: ${healthStatus}, Sync: ${syncStatus}, Operation: ${operationPhase}`;
          console.log(`⏳ ${statusMsg} - continuing to monitor`);
          throw new Error(`Waiting for sync to complete: ${statusMsg}`);
        };
        
        // Monitor the sync process with robust retry logic
        try {
          // Use async-retry to poll until the application sync completes or until we detect a failure
          const maxRetries = Math.floor(timeoutMs / 10000); // Calculate number of retries based on timeout
          
          const result = await retry(monitorSyncProcess, {
            retries: maxRetries,
            factor: 1.5,
            minTimeout: 5000,  // Start with 5 second intervals
            maxTimeout: 30000, // Maximum 30 seconds between retries
            onRetry: (error: Error, attempt: number) => {
              const elapsed = Math.round((Date.now() - startTime) / 1000);
              console.log(`[SYNC-MONITOR ${attempt}/${maxRetries}] 🔄 Application: ${applicationName} | Elapsed: ${elapsed}s | Reason: ${error.message}`);
            }
          });
          
          return result;
        } catch (error: any) {
          // If we exited the retry due to bail() or exceeded retries
          if (error.message.includes('Sync failed')) {
            console.error(`Sync operation failed for application ${applicationName}: ${error.message}`);
          } else {
            console.warn(`Sync monitoring ended without success for application ${applicationName}: ${error.message}`);
          }
          
          // Get detailed application status to help with debugging
          try {
            console.log(`Fetching detailed status for ${applicationName}:`);
            const status = await this.getApplicationStatus(applicationName, namespace);
            console.log(`Application details: ${status}`);
          } catch (statusError) {
            console.error(`Unable to fetch application status: ${statusError}`);
          }
          
          return false;
        }
      } catch (syncError: any) {
        console.error(`Error executing sync command: ${syncError.message}`);
        throw new Error(`Failed to sync application: ${syncError.message}`);
      }
    } catch (error: any) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.error(
        `Failed to sync application ${applicationName} after ${elapsed}s: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Get the status of an ArgoCD application
   */
  public async getApplicationStatus(
    applicationName: string,
    namespace: string
  ): Promise<string | null> {
    try {
      const application = await this.getApplication(applicationName, namespace);
      if (!application || !application.status) {
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
    } catch (error) {
      console.error(
        `Error getting application status: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get health status of an ArgoCD application
   */
  public async getApplicationHealth(
    applicationName: string,
    namespace: string
  ): Promise<string | null> {
    try {
      const application = await this.getApplication(applicationName, namespace);
      return application?.status?.health?.status || 'Unknown';
    } catch (error) {
      console.error(
        `Error getting application health: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get sync status of an ArgoCD application
   */
  public async getApplicationSyncStatus(
    applicationName: string,
    namespace: string
  ): Promise<string | null> {
    try {
      const application = await this.getApplication(applicationName, namespace);
      return application?.status?.sync?.status || 'Unknown';
    } catch (error) {
      console.error(
        `Error getting application sync status: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get operation phase of an ArgoCD application
   */
  public async getApplicationOperationPhase(
    applicationName: string,
    namespace: string
  ): Promise<string | null> {
    try {
      const application = await this.getApplication(applicationName, namespace);
      return application?.status?.operationState?.phase || 'Unknown';
    } catch (error) {
      console.error(
        `Error getting application operation phase: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}

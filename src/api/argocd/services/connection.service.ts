import { KubeClient } from '../../ocp/kubeClient';
import retry from 'async-retry';
import {
  ArgoCDConnectionInfo,
  ArgoCDConnectionConfig,
  ArgoCDCliConfig,
  ArgoCDInstanceKind,
} from '../types/connection.types';
import {
  ArgoCDConnectionError,
  ArgoCDInstanceNotFoundError,
} from '../errors/argocd.errors';

/**
 * Service for managing ArgoCD connections
 */
export class ArgoCDConnectionService {
  private readonly API_GROUP = 'argoproj.io';
  private readonly API_VERSION = 'v1alpha1';
  private readonly ARGOCD_PLURAL = 'argocds';

  constructor(private readonly kubeClient: KubeClient) {}

  /**
   * Gets the name of the ArgoCD instance in the specified namespace.
   * Includes retry logic to handle rate limiting scenarios.
   */
  public async getInstanceName(namespace: string): Promise<string> {
    try {
      return await retry(
        async (bail) => {
          try {
            const options = this.kubeClient.createApiOptions(
              this.API_GROUP,
              this.API_VERSION,
              this.ARGOCD_PLURAL,
              namespace
            );

            const instances = await this.kubeClient.listResources<ArgoCDInstanceKind>(options);
            if (!instances || instances.length === 0) {
              throw new ArgoCDInstanceNotFoundError(namespace);
            }

            const instanceName = instances[0]?.metadata?.name;
            if (!instanceName) {
              throw new ArgoCDInstanceNotFoundError(namespace);
            }

            return instanceName;
          } catch (error) {
            // If it's not rate limiting, bail immediately
            if (error instanceof ArgoCDConnectionError) {
              bail(error);
            }

            // For other errors (including rate limiting), allow retry
            throw error;
          }
        },
        {
          retries: 3,
          minTimeout: 2000,
          factor: 2,
          maxTimeout: 30000,
          onRetry: (error: Error, attempt: number) => {
            console.log(
              `[ARGOCD-INSTANCE-RETRY ${attempt}/3] 🔄 Retrying ArgoCD instance lookup for namespace ${namespace} | Reason: ${error.message}`
            );
          },
        }
      );
    } catch (error) {
      if (error instanceof ArgoCDInstanceNotFoundError) {
        throw error;
      }
      throw new ArgoCDConnectionError(
        `Failed to get ArgoCD instance name in namespace ${namespace}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Gets the ArgoCD server route for the specified instance.
   */
  public async getServerRoute(namespace: string, instanceName: string): Promise<string> {
    try {
      const route = await this.kubeClient.getOpenshiftRoute(`${instanceName}-server`, namespace);
      if (!route) {
        throw new ArgoCDConnectionError(
          `No route ${instanceName}-server found for ArgoCD server in namespace ${namespace}`
        );
      }
      return route;
    } catch (error) {
      throw new ArgoCDConnectionError(
        `Failed to get ArgoCD server route in namespace ${namespace}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Gets the ArgoCD admin password for the specified instance.
   */
  public async getAdminPassword(namespace: string, instanceName: string): Promise<string> {
    try {
      const secret = await this.kubeClient.getSecret(`${instanceName}-cluster`, namespace);

      const password = secret['admin.password'];
      if (!password) {
        throw new ArgoCDConnectionError(
          `No admin password found in secret ${instanceName}-cluster in namespace ${namespace}`
        );
      }

      return password;
    } catch (error) {
      throw new ArgoCDConnectionError(
        `Failed to get ArgoCD admin password in namespace ${namespace}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Gets complete connection information for ArgoCD in the specified namespace.
   */
  public async getConnectionInfo(
    config: ArgoCDConnectionConfig
  ): Promise<ArgoCDConnectionInfo> {
    try {
      // Get instance name
      const instanceName = config.instanceName || await this.getInstanceName(config.namespace);

      // Get server URL
      const serverUrl = await this.getServerRoute(config.namespace, instanceName);

      // Get admin password
      const password = await this.getAdminPassword(config.namespace, instanceName);

      return {
        serverUrl,
        username: 'admin',
        password,
      };
    } catch (error) {
      if (error instanceof ArgoCDConnectionError) {
        throw error;
      }
      throw new ArgoCDConnectionError(
        `Failed to get ArgoCD connection info for namespace ${config.namespace}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Creates CLI configuration from connection info
   */
  public createCliConfig(connectionInfo: ArgoCDConnectionInfo): ArgoCDCliConfig {
    return {
      serverUrl: connectionInfo.serverUrl,
      username: connectionInfo.username,
      password: connectionInfo.password,
      insecure: true,
      skipTestTls: true,
      grpcWeb: true,
    };
  }
} 
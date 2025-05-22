import { TaskRunKind } from '@janus-idp/shared-react/dist/index';
import { CoreV1Api, CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import * as k8s from '@kubernetes/client-node';

/**
 * Interface for standardized Kubernetes API options
 * Used for consistent custom resource API calls
 */
export interface K8sApiOptions {
  group: string;
  version: string;
  plural: string;
  namespace: string;
  name?: string;
  labelSelector?: string;
}

export class KubeClient {
  private kubeConfig: KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private customApi: k8s.CustomObjectsApi;
  // private networkingApi: k8s.NetworkingV1Api;

  //TODO: need to move the parameter skipTLSVerify to the constructor
  constructor() {
    this.kubeConfig = new KubeConfig();
    this.kubeConfig.loadFromDefault();

    this.k8sApi = this.kubeConfig.makeApiClient(CoreV1Api);
    this.customApi = this.kubeConfig.makeApiClient(CustomObjectsApi);
    // this.networkingApi = this.kubeConfig.makeApiClient(NetworkingV1Api);
  }

  /**
   * Retrieves a secret from Kubernetes
   * @param secretName The name of the secret
   * @param namespace The namespace where the secret is located (default: 'default')
   * @returns A Promise that resolves to an object containing the decoded secret data
   * @throws Error if the secret cannot be retrieved
   */
  public async getSecret(
    secretName: string,
    namespace: string = 'default'
  ): Promise<Record<string, string>> {
    try {
      const response = await this.k8sApi.readNamespacedSecret({
        name: secretName,
        namespace: namespace,
      });
      const secretData = response.data || {};

      // Decode all base64-encoded values
      const decodedData: Record<string, string> = {};
      for (const [key, value] of Object.entries(secretData)) {
        decodedData[key] = Buffer.from(value, 'base64').toString('utf-8');
      }

      return decodedData;
    } catch (error) {
      //TODO: need to handle this error with a proper error message
      throw new Error(`Failed to retrieve secret '${secretName}': ${error}`);
    }
  }

  /**
   * Waits for a specified duration.
   *
   * @param {number} timeoutMs - The duration to wait in milliseconds.
   * @returns {Promise<void>} A Promise that resolves once the specified duration has elapsed.
   */
  public async getOpenshiftRoute(name: string, namespace: string): Promise<string> {
    try {
      const options = this.createApiOptions('route.openshift.io', 'v1', 'routes', namespace, {
        name,
      });

      if (!options.name) {
        throw new Error('Route name is required');
      }

      const route = await this.customApi.getNamespacedCustomObject({
        group: options.group,
        version: options.version,
        namespace: options.namespace,
        plural: options.plural,
        name: options.name,
      });
      return route.spec.host;
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to obtain openshift route ${name}: ${error}`);
    }
  }

  /// Retrieves a Tekton PipelineRun from Kubernetes
  /// @param {string} name - The name of the PipelineRun.
  /// @param {string} namespace - The namespace where the PipelineRun is located.
  /// @returns {Promise<unknown>} A Promise that resolves to the PipelineRun object.
  /// @throws {Error} If the PipelineRun cannot be retrieved.
  public async getTektonPipelineRunByName(name: string, namespace: string): Promise<unknown> {
    try {
      const options = this.createApiOptions('tekton.dev', 'v1', 'pipelineruns', namespace, {
        name,
      });

      if (!options.name) {
        throw new Error('PipelineRun name is required');
      }

      const response = await this.customApi.getNamespacedCustomObject({
        group: options.group,
        version: options.version,
        namespace: options.namespace,
        plural: options.plural,
        name: options.name,
      });
      return response;
    } catch (error) {
      throw new Error(`Failed to retrieve Tekton PipelineRun '${name}': ${error}`);
    }
  }

  /// Retrieves a Tekton TaskRun from Kubernetes
  /// @param {string} name - The name of the TaskRun.
  /// @param {string} namespace - The namespace where the TaskRun is located.
  /// @returns {Promise<TaskRunKind>} A Promise that resolves to the TaskRun object.
  /// @throws {Error} If the TaskRun cannot be retrieved.
  public async getTektonTaskRun(name: string, namespace: string): Promise<TaskRunKind> {
    try {
      const options = this.createApiOptions('tekton.dev', 'v1', 'taskruns', namespace, {
        name,
      });

      if (!options.name) {
        throw new Error('TaskRun name is required');
      }

      const response = await this.customApi.getNamespacedCustomObject({
        group: options.group,
        version: options.version,
        namespace: options.namespace,
        plural: options.plural,
        name: options.name,
      });
      return response as TaskRunKind;
    } catch (error) {
      throw new Error(`Failed to retrieve Tekton TaskRun '${name}': ${error}`);
    }
  }

  public getCustomApi(): k8s.CustomObjectsApi {
    return this.customApi;
  }

  public getK8sApi(): k8s.CoreV1Api {
    return this.k8sApi;
  }

  public getKubeConfig(): KubeConfig {
    return this.kubeConfig;
  }

  /**
   * Creates standardized API options for Kubernetes custom resource operations
   *
   * @param {string} group - The API group (e.g., 'tekton.dev', 'route.openshift.io')
   * @param {string} version - The API version (e.g., 'v1', 'v1beta1')
   * @param {string} plural - The resource plural name (e.g., 'pipelineruns', 'routes')
   * @param {string} namespace - The namespace where the resource is located
   * @param {Object} additionalOptions - Additional options to include (e.g., name, labelSelector)
   * @returns {K8sApiOptions} Standardized API options object
   */
  public createApiOptions(
    group: string,
    version: string,
    plural: string,
    namespace: string,
    additionalOptions: Partial<K8sApiOptions> = {}
  ): K8sApiOptions {
    return {
      group,
      version,
      plural,
      namespace,
      ...additionalOptions,
    };
  }

  /**
   * Generic method to list resources with proper error handling
   *
   * @template T The resource type to return
   * @param {K8sApiOptions} options - API options for the request
   * @returns {Promise<T[]>} Array of resources of type T
   */
  public async listResources<T>(options: K8sApiOptions): Promise<T[]> {
    try {
      const response = await this.customApi.listNamespacedCustomObject({
        group: options.group,
        version: options.version,
        namespace: options.namespace,
        plural: options.plural,
        ...(options.labelSelector ? { labelSelector: options.labelSelector } : {}),
      });

      if (response && Array.isArray(response.items)) {
        return response.items as T[];
      } else {
        console.warn(
          `Unexpected response format when fetching resources: ${JSON.stringify(response)}`
        );
        return [];
      }
    } catch (error) {
      const labelInfo = options.labelSelector
        ? ` with label selector '${options.labelSelector}'`
        : '';
      console.error(
        `Error fetching resources in namespace '${options.namespace}'${labelInfo}: ${error}`
      );
      return [];
    }
  }

  /**
   * Generic method to get a single resource with proper error handling
   *
   * @template T The resource type to return
   * @param {K8sApiOptions} options - API options for the request (must include name)
   * @returns {Promise<T | null>} The resource of type T or null if not found
   */
  public async getResource<T>(options: K8sApiOptions): Promise<T | null> {
    try {
      if (!options.name) {
        throw new Error('Resource name is required for getResource');
      }

      const response = await this.customApi.getNamespacedCustomObject({
        group: options.group,
        version: options.version,
        namespace: options.namespace,
        plural: options.plural,
        name: options.name,
      });
      return response as T;
    } catch (error) {
      console.error(
        `Error getting resource '${options.name}' in namespace '${options.namespace}': ${error}`
      );
      return null;
    }
  }

  /**
   * Retrieves logs from a pod or specific containers within a pod
   * @param podName The name of the pod
   * @param namespace The namespace where the pod is located (default: 'default')
   * @param containerName Optional name of a specific container to get logs from
   * @returns A Promise that resolves to the pod logs as a string
   */
  public async getPodLogs(
    podName: string,
    namespace: string = 'default',
    containerName?: string
  ): Promise<string> {
    try {
      // First get the pod to verify it exists and to get container info
      const response = await this.k8sApi.readNamespacedPod({
        name: podName,
        namespace: namespace,
      });
      if (!response) {
        throw new Error(`Pod '${podName}' not found in namespace '${namespace}'`);
      }

      const allLogs: string[] = [];

      // If a specific container is requested, only get logs for that container
      if (containerName) {
        const logResponse = await this.k8sApi.readNamespacedPodLog({
          name: podName,
          namespace: namespace,
          container: containerName,
        });
        return logResponse || '';
      }
      // Otherwise get logs for all containers
      const pod = response;
      const containers = pod.spec?.containers || [];
      const initContainers = pod.spec?.initContainers || [];
      const allContainers = [...initContainers, ...containers];
      // Get logs for each container
      for (const container of allContainers) {
        try {
          const logResponse = await this.k8sApi.readNamespacedPodLog({
            name: podName,
            namespace: namespace,
            container: container.name,
          });
          allLogs.push(
            `--- Container: ${container.name} ---\n${logResponse || 'No logs available'}\n`
          );
        } catch (logError: unknown) {
          allLogs.push(
            `--- Container: ${container.name} ---\nError getting logs: ${(logError as Error).message || 'Unknown error'}\n`
          );
        }
      }
      return allLogs.join('\n');
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve logs for pod '${podName}': ${(error as Error).message}`);
    }
  }

  public async getCosignPrivateKey(): Promise<string> {
    const secret = await this.getSecret('signing-secrets', 'openshift-pipelines');
    if (!secret) {
      console.error('Failed to retrieve the secret');
      throw new Error('Secret signing-secrets under namespace openshift-pipelines not found');
    }
    const key = secret['cosign.key'];
    if (!key) {
      console.error('Failed to retrieve the cosign private key from the secret');
      throw new Error('Cosign private key not found in the secret');
    }
    return key;
  }

  public async getCosignPrivateKeyPassword(): Promise<string> {
    const secret = await this.getSecret('signing-secrets', 'openshift-pipelines');
    if (!secret) {
      console.error('Failed to retrieve the secret');
      throw new Error('Secret signing-secrets under namespace openshift-pipelines not found');
    }
    const key = secret['cosign.password'];
    if (!key) {
      console.error('Failed to retrieve the cosign private key password from the secret');
      throw new Error('Cosign private key password not found in the secret');
    }
    return key;
  }

  /**
   * Retrieves the Cosign public key from Kubernetes secrets
   * @returns The Cosign public key as a string
   */
  public async getCosignPublicKey(): Promise<string> {
    const secret = await this.getSecret('signing-secrets', 'openshift-pipelines');
    if (!secret) {
      console.error('Failed to retrieve the secret');
      throw new Error('Secret signing-secrets under namespace openshift-pipelines not found');
    }
    const key = secret['cosign.pub'];
    if (!key) {
      console.error('Failed to retrieve the cosign public key from the secret');
      throw new Error('Cosign public key not found in the secret');
    }
    return key;
  }
}

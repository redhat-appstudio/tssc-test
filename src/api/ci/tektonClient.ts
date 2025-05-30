import { KubeClient } from '../ocp/kubeClient';
import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';
import retry from 'async-retry';

export class TektonClient {
  private kubeClient: KubeClient;
  private readonly API_GROUP = 'tekton.dev';
  private readonly API_VERSION = 'v1';
  private readonly PIPELINE_RUNS_PLURAL = 'pipelineruns';

  constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
  }

  /**
   * Fetches pipeline runs by commit SHA with retry functionality
   */
  public async getPipelineRunByCommitSha(
    namespace: string,
    eventType: string,
    commitSha: string
  ): Promise<PipelineRunKind | null> {
    const maxRetries: number = 5;
    const retryDelayMs: number = 3000;
    try {
      return await retry(
        async () => {
          const options = this.kubeClient.createApiOptions(
            this.API_GROUP,
            this.API_VERSION,
            this.PIPELINE_RUNS_PLURAL,
            namespace,
            { labelSelector: `pipelinesascode.tekton.dev/sha=${commitSha}` }
          );

          const pipelineRuns = await this.kubeClient.listResources<PipelineRunKind>(options);

          if (!pipelineRuns || pipelineRuns.length === 0) {
            throw new Error(`No PipelineRuns found for SHA ${commitSha}`);
          }

          const pipelineRun = this.findPipelineRunByEventType(pipelineRuns, eventType);

          if (!pipelineRun) {
            throw new Error(
              `Found PipelineRuns for SHA ${commitSha} but none match event type ${eventType}`
            );
          }

          console.log(`Found Tekton PipelineRun: ${pipelineRun.metadata?.name}`);

          return pipelineRun;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 SHA: ${commitSha} | Event: ${eventType} | Reason: ${error.message}`
            );
          },
        }
      );
    } catch (error: unknown) {
      console.error(`Failed to get pipeline run after retries: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get a PipelineRun by its name with retry functionality
   *
   * This method retrieves a specific PipelineRun resource by name. It implements
   * retry logic to handle potential network issues or timing-related problems
   * when accessing the Kubernetes API.
   *
   * @param namespace - The Kubernetes namespace where the PipelineRun exists
   * @param name - The name of the PipelineRun to retrieve
   * @param maxRetries - Maximum number of retry attempts if resource isn't found (defaults to 5)
   * @param retryDelayMs - Delay in milliseconds between retry attempts (defaults to 3000ms)
   * @returns Promise resolving to the PipelineRunKind object or null if not found
   */
  public async getPipelineRunByName(
    namespace: string,
    name: string
  ): Promise<PipelineRunKind | null> {
    const maxRetries: number = 5;
    const retryDelayMs: number = 3000;
    try {
      return await retry(
        async () => {
          const options = this.kubeClient.createApiOptions(
            this.API_GROUP,
            this.API_VERSION,
            this.PIPELINE_RUNS_PLURAL,
            namespace,
            { name }
          );

          const pipelineRun = await this.kubeClient.getResource<PipelineRunKind>(options);

          if (!pipelineRun) {
            throw new Error(`No PipelineRun found with name ${name} in namespace ${namespace}`);
          }

          console.log(`Found Tekton PipelineRun: ${name} in namespace ${namespace}`);

          return pipelineRun;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 Name: ${name} | Namespace: ${namespace} | Reason: ${error.message}`
            );
          },
        }
      );
    } catch (error: unknown) {
      console.error(
        `Failed to get pipeline run ${name} after retries: ${(error as Error).message}`
      );
      return null;
    }
  }

  /**
   * Fetches pipeline runs associated with a specific Git repository
   *
   * This method retrieves all PipelineRun resources that are associated with
   * the specified Git repository. It supports filtering by pipeline status
   * and implements retry logic to handle potential network issues or
   * timing-related problems when accessing the Kubernetes API.
   *
   * @param namespace - The Kubernetes namespace where the PipelineRuns exist
   * @param gitRepository - The Git repository identifier to filter by
   * @param pipelineStatus - Optional status to filter the pipeline runs (defaults to RUNNING)
   * @param maxRetries - Maximum number of retry attempts if resource isn't found (defaults to 5)
   * @param retryDelayMs - Delay in milliseconds between retry attempts (defaults to 5000ms)
   * @returns Promise resolving to an array of matching PipelineRunKind objects (empty if none found)
   * @throws Error if namespace or gitRepository parameters are invalid
   */
  public async getPipelineRunsByGitRepository(
    namespace: string,
    gitRepository: string
  ): Promise<PipelineRunKind[]> {
    const maxRetries: number = 2;
    const retryDelayMs: number = 5000;

    try {
      return await retry(
        async () => {
          const options = this.kubeClient.createApiOptions(
            this.API_GROUP,
            this.API_VERSION,
            this.PIPELINE_RUNS_PLURAL,
            namespace,
            { labelSelector: `pipelinesascode.tekton.dev/url-repository=${gitRepository}` }
          );

          const pipelineRuns = await this.kubeClient.listResources<PipelineRunKind>(options);

          if (!pipelineRuns || pipelineRuns.length === 0) {
            throw new Error(`No PipelineRuns found for repository ${gitRepository}`);
          }

          console.log(
            `Found ${pipelineRuns.length} Tekton PipelineRuns for repository: ${gitRepository}`
          );
          return pipelineRuns;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          maxTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 Repository: ${gitRepository} | Status: Waiting | Reason: ${error.message}`
            );
          },
        }
      );
    } catch (error: unknown) {
      console.error(`Failed to get pipeline runs after retries: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Finds a single pipeline run by event type
   */
  private findPipelineRunByEventType(
    pipelineRuns: PipelineRunKind[],
    eventType: string
  ): PipelineRunKind | null {
    return (
      pipelineRuns.find((pipelineRun: PipelineRunKind) => {
        const labels = pipelineRun.metadata?.labels || {};
        const eventTypeLabel = labels['pipelinesascode.tekton.dev/event-type'];
        return eventTypeLabel === eventType;
      }) || null
    );
  }

  /**
   * Get logs from a Tekton PipelineRun
   * @param namespace The namespace where the PipelineRun is located
   * @param pipelineRunName The name of the PipelineRun
   * @returns A Promise that resolves to the aggregated logs as a string or an empty string if not found
   */
  public async getPipelineRunLogs(namespace: string, pipelineRunName: string): Promise<string> {
    try {
      console.log(`Retrieving logs for PipelineRun: ${pipelineRunName} in namespace: ${namespace}`);

      // Get the PipelineRun resource
      const pipelineRun = await this.getPipelineRunByName(namespace, pipelineRunName);

      if (!pipelineRun || !pipelineRun.status) {
        console.log(`PipelineRun '${pipelineRunName}' not found or has no status.`);
        return '';
      }

      const allLogs: string[] = [];

      // In Tekton v1, TaskRuns are referenced via childReferences
      let taskRunReferences: Array<{ name: string; pipelineTaskName?: string }> = [];

      // Get TaskRun references from Tekton v1 structure (childReferences)
      if ((pipelineRun.status as unknown as { childReferences?: unknown[] }).childReferences) {
        const childReferences = (pipelineRun.status as unknown as { childReferences: unknown[] })
          .childReferences;
        taskRunReferences = childReferences
          .filter((ref: unknown) => (ref as { kind: string }).kind === 'TaskRun')
          .map((ref: unknown) => ({
            name: (ref as { name: string }).name,
            pipelineTaskName: (ref as { pipelineTaskName?: string }).pipelineTaskName,
          }));
      }
      if (taskRunReferences.length === 0) {
        console.log(`PipelineRun '${pipelineRunName}' has no TaskRuns yet.`);
        return 'No TaskRuns found for this PipelineRun yet.\n';
      }
      // Iterate through each TaskRun and get its logs
      for (const taskRunRef of taskRunReferences) {
        const taskRunName = taskRunRef.name;
        const pipelineTaskName = taskRunRef.pipelineTaskName || taskRunName;

        allLogs.push(`\n--- TaskRun: ${pipelineTaskName} (${taskRunName}) ---\n`);

        try {
          // Get the TaskRun resource to find the associated pod
          const taskRun: TaskRunKind = await this.kubeClient.getTektonTaskRun(
            taskRunName,
            namespace
          );

          if (!taskRun || !taskRun.status) {
            allLogs.push(`TaskRun '${taskRunName}' has no status yet.\n`);
            continue;
          }
          // Check if TaskRun has an associated pod
          const podName = taskRun.status.podName;
          if (!podName) {
            allLogs.push(`TaskRun '${taskRunName}' has no associated Pod yet.\n`);
            continue;
          }
          // Get logs from the pod
          const podLogs = await this.kubeClient.getPodLogs(podName, namespace);
          allLogs.push(podLogs || 'No logs available for this TaskRun.\n');
        } catch (taskRunError: unknown) {
          allLogs.push(
            `Error getting TaskRun '${taskRunName}': ${(taskRunError as Error).message}\n`
          );
        }
      }

      return allLogs.join('\n');
    } catch (error: unknown) {
      console.error(`Error getting PipelineRun logs: ${(error as Error).message}`);
      return '';
    }
  }
}

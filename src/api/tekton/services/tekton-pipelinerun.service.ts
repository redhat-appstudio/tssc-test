import { KubeClient } from '../../ocp/kubeClient';
import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';
import retry from 'async-retry';

// Type-safe interfaces for PipelineRun status structure
interface ChildReference {
  kind: string;
  name: string;
  pipelineTaskName?: string;
}

interface PipelineRunStatus {
  childReferences?: ChildReference[];
}

interface TaskRunReference {
  name: string;
  pipelineTaskName?: string;
}

export class TektonPipelineRunService {
  private readonly kubeClient: KubeClient;
  private readonly API_GROUP = 'tekton.dev';
  private readonly API_VERSION = 'v1';
  private readonly PIPELINE_RUNS_PLURAL = 'pipelineruns';

  constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
  }

  public async getPipelineRunByCommitSha(
    namespace: string,
    eventType: string,
    commitSha: string,
  ): Promise<PipelineRunKind | null> {
    const maxRetries = 5;
    const retryDelayMs = 3000;
    try {
      return await retry(
        async () => {
          const options = this.kubeClient.createApiOptions(
            this.API_GROUP,
            this.API_VERSION,
            this.PIPELINE_RUNS_PLURAL,
            namespace,
            { labelSelector: `pipelinesascode.tekton.dev/sha=${commitSha}` },
          );

          const pipelineRuns =
            await this.kubeClient.listResources<PipelineRunKind>(options);

          if (!pipelineRuns || pipelineRuns.length === 0) {
            throw new Error(`No PipelineRuns found for SHA ${commitSha}`);
          }

          const pipelineRun = this.findPipelineRunByEventType(
            pipelineRuns,
            eventType,
          );

          if (!pipelineRun) {
            throw new Error(
              `Found PipelineRuns for SHA ${commitSha} but none match event type ${eventType}`,
            );
          }

          console.log(
            `Found Tekton PipelineRun: ${pipelineRun.metadata?.name}`,
          );

          return pipelineRun;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 SHA: ${commitSha} | Event: ${eventType} | Reason: ${error.message}`,
            );
          },
        },
      );
    } catch (error: unknown) {
      console.error(
        `Failed to get pipeline run after retries: ${(error as Error).message}`,
      );
      return null;
    }
  }

  public async getPipelineRunByName(
    namespace: string,
    name: string,
  ): Promise<PipelineRunKind | null> {
    const maxRetries = 5;
    const retryDelayMs = 3000;
    try {
      return await retry(
        async () => {
          const options = this.kubeClient.createApiOptions(
            this.API_GROUP,
            this.API_VERSION,
            this.PIPELINE_RUNS_PLURAL,
            namespace,
            { name },
          );

          const pipelineRun =
            await this.kubeClient.getResource<PipelineRunKind>(options);

          if (!pipelineRun) {
            throw new Error(
              `No PipelineRun found with name ${name} in namespace ${namespace}`,
            );
          }

          console.log(
            `Found Tekton PipelineRun: ${name} in namespace ${namespace}`,
          );

          return pipelineRun;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 Name: ${name} | Namespace: ${namespace} | Reason: ${error.message}`,
            );
          },
        },
      );
    } catch (error: unknown) {
      console.error(
        `Failed to get pipeline run ${name} after retries: ${(error as Error).message}`,
      );
      return null;
    }
  }

  public async getPipelineRunsByGitRepository(
    namespace: string,
    gitRepository: string,
  ): Promise<PipelineRunKind[]> {
    const maxRetries = 2;
    const retryDelayMs = 5000;

    try {
      return await retry(
        async () => {
          const options = this.kubeClient.createApiOptions(
            this.API_GROUP,
            this.API_VERSION,
            this.PIPELINE_RUNS_PLURAL,
            namespace,
            {
              labelSelector: `pipelinesascode.tekton.dev/url-repository=${gitRepository}`,
            },
          );

          const pipelineRuns =
            await this.kubeClient.listResources<PipelineRunKind>(options);

          if (!pipelineRuns || pipelineRuns.length === 0) {
            throw new Error(
              `No PipelineRuns found for repository ${gitRepository}`,
            );
          }

          console.log(
            `Found ${pipelineRuns.length} Tekton PipelineRuns for repository: ${gitRepository}`,
          );
          return pipelineRuns;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          maxTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 Repository: ${gitRepository} | Status: Waiting | Reason: ${error.message}`,
            );
          },
        },
      );
    } catch (error: unknown) {
      console.error(
        `Failed to get pipeline runs after retries: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Cancel a running PipelineRun by patching its spec
   */
  public async cancelPipelineRun(namespace: string, name: string): Promise<void> {
    try {
      const options = this.kubeClient.createApiOptions(
        this.API_GROUP,
        this.API_VERSION,
        this.PIPELINE_RUNS_PLURAL,
        namespace,
        { name }
      );

      // Patch the PipelineRun to set status to cancelled
      const patchData = {
        spec: {
          status: 'PipelineRunCancelled'
        }
      };

      await this.kubeClient.patchResource(options, patchData);

      console.log(`Successfully cancelled PipelineRun: ${name} in namespace: ${namespace}`);
    } catch (error: unknown) {
      const errorMessage = (error as Error).message;
      console.error(`Failed to cancel PipelineRun ${name}: ${errorMessage}`);
      throw new Error(`Failed to cancel PipelineRun ${name}: ${errorMessage}`);
    }
  }

  private findPipelineRunByEventType(
    pipelineRuns: PipelineRunKind[],
    eventType: string,
  ): PipelineRunKind | null {
    return (
      pipelineRuns.find((pipelineRun: PipelineRunKind) => {
        const labels = pipelineRun.metadata?.labels || {};
        const eventTypeLabel =
          labels['pipelinesascode.tekton.dev/event-type'];
        return eventTypeLabel === eventType;
      }) || null
    );
  }

  public async getPipelineRunLogs(
    namespace: string,
    pipelineRunName: string,
  ): Promise<string> {
    try {
      console.log(
        `Retrieving logs for PipelineRun: ${pipelineRunName} in namespace: ${namespace}`,
      );

      const pipelineRun = await this.getPipelineRunByName(
        namespace,
        pipelineRunName,
      );

      if (!pipelineRun || !pipelineRun.status) {
        console.log(
          `PipelineRun '${pipelineRunName}' not found or has no status.`,
        );
        return '';
      }

      const taskRunReferences = this.getTaskRunReferences(pipelineRun);
      if (taskRunReferences.length === 0) {
        console.log(`PipelineRun '${pipelineRunName}' has no TaskRuns yet.`);
        return 'No TaskRuns found for this PipelineRun yet.\n';
      }

      const logPromises = taskRunReferences.map(ref =>
        this.getTaskRunLog(namespace, ref.name, ref.pipelineTaskName),
      );
      const logs = await Promise.all(logPromises);

      return logs.join('\n');
    } catch (error: unknown) {
      console.error(
        `Error getting PipelineRun logs: ${(error as Error).message}`,
      );
      return '';
    }
  }

  private getTaskRunReferences(
    pipelineRun: PipelineRunKind,
  ): TaskRunReference[] {
    const status = pipelineRun.status as PipelineRunStatus;
    const childReferences = status?.childReferences;
    if (!childReferences) return [];

    return childReferences
      .filter((ref): ref is ChildReference => ref.kind === 'TaskRun')
      .map(ref => ({
        name: ref.name,
        pipelineTaskName: ref.pipelineTaskName,
      }));
  }

  private async getTaskRunLog(
    namespace: string,
    taskRunName: string,
    pipelineTaskName?: string,
  ): Promise<string> {
    const taskIdentifier = pipelineTaskName || taskRunName;
    let log = `\n--- TaskRun: ${taskIdentifier} (${taskRunName}) ---\n`;

    try {
      const taskRun: TaskRunKind = await this.kubeClient.getTektonTaskRun(
        taskRunName,
        namespace,
      );

      if (!taskRun || !taskRun.status) {
        return `${log}TaskRun '${taskRunName}' has no status yet.\n`;
      }

      const podName = taskRun.status.podName;
      if (!podName) {
        return `${log}TaskRun '${taskRunName}' has no associated Pod yet.\n`;
      }

      const podLogs = await this.kubeClient.getPodLogs(podName, namespace);
      return `${log}${podLogs || 'No logs available for this TaskRun.\n'}`;
    } catch (error: unknown) {
      return `${log}Error getting TaskRun '${taskRunName}': ${(error as Error).message}\n`;
    }
  }
}

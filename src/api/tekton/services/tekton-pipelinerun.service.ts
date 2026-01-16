import { KubeClient } from '../../ocp/kubeClient';
import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';
import retry from 'async-retry';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

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
  private readonly logger: Logger;
  private readonly API_GROUP = 'tekton.dev';
  private readonly API_VERSION = 'v1';
  private readonly PIPELINE_RUNS_PLURAL = 'pipelineruns';

  constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
    this.logger = LoggerFactory.getLogger('tekton.pipelinerun');
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

          this.logger.info('Found Tekton PipelineRun: {}', pipelineRun.metadata?.name);

          return pipelineRun;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            this.logger.warn('[TEKTON-RETRY {}/{}] SHA: {} | Event: {} | Reason: {}', attemptNumber, maxRetries, commitSha, eventType, error);
          },
        },
      );
    } catch (error: unknown) {
      this.logger.error('Failed to get pipeline run after retries: {}', (error as Error).message);
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

          this.logger.info('Found Tekton PipelineRun: {} in namespace {}', name, namespace);

          return pipelineRun;
        },
        {
          retries: maxRetries,
          minTimeout: retryDelayMs,
          onRetry: (error: Error, attemptNumber) => {
            this.logger.warn('[TEKTON-RETRY {}/{}] Name: {} | Namespace: {} | Reason: {}', attemptNumber, maxRetries, name, namespace, error);
          },
        },
      );
    } catch (error: unknown) {
      this.logger.error('Failed to get pipeline run {} after retries: {}', name, (error as Error).message);
      return null;
    }
  }

  public async getPipelineRunsByGitRepository(
    namespace: string,
    gitRepository: string,
  ): Promise<PipelineRunKind[]> {
    try {
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

      this.logger.info('Found {} Tekton PipelineRuns for repository: {}', pipelineRuns?.length || 0, gitRepository);
      
      return pipelineRuns || [];
    } catch (error: unknown) {
      this.logger.error('Failed to get pipeline runs for repository {}: {}', gitRepository, (error as Error).message);
      throw error;
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

      this.logger.info('Successfully cancelled PipelineRun: {} in namespace: {}', name, namespace);
    } catch (error: unknown) {
      const errorMessage = (error as Error).message;
      this.logger.error('Failed to cancel PipelineRun {}: {}', name, errorMessage);
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
      this.logger.info('Retrieving logs for PipelineRun: {} in namespace: {}', pipelineRunName, namespace);

      const pipelineRun = await this.getPipelineRunByName(
        namespace,
        pipelineRunName,
      );

      if (!pipelineRun || !pipelineRun.status) {
        this.logger.info('PipelineRun \'{}\' not found or has no status', pipelineRunName);
        return '';
      }

      const taskRunReferences = this.getTaskRunReferences(pipelineRun);
      if (taskRunReferences.length === 0) {
        this.logger.info('PipelineRun \'{}\' has no TaskRuns yet', pipelineRunName);
        return 'No TaskRuns found for this PipelineRun yet.\n';
      }

      const logPromises = taskRunReferences.map(ref =>
        this.getTaskRunLog(namespace, ref.name, ref.pipelineTaskName),
      );
      const logs = await Promise.all(logPromises);

      return logs.join('\n');
    } catch (error: unknown) {
      this.logger.error('Error getting PipelineRun logs: {}', (error as Error).message);
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

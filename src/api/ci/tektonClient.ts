import { retryOperation } from '../../utils/util';
import { KubeClient } from '../ocp/kubeClient';
import { PipelineRunKind } from '@janus-idp/shared-react';

export class TektonClient {
  private kubeClient: KubeClient;
  private readonly API_GROUP = 'tekton.dev';
  private readonly API_VERSION = 'v1beta1';
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
    commitSha: string,
    maxRetries: number = 5,
    retryDelayMs: number = 3000
  ): Promise<PipelineRunKind | null> {
    return retryOperation<PipelineRunKind>(
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
          return {
            success: false,
            result: null,
            message: `No PipelineRuns found for SHA ${commitSha}`,
          };
        }

        const pipelineRun = this.findPipelineRunByEventType(pipelineRuns, eventType);

        if (!pipelineRun) {
          return {
            success: false,
            result: null,
            message: `Found PipelineRuns for SHA ${commitSha} but none match event type ${eventType}`,
          };
        }

        console.log(`Found Tekton PipelineRun: ${pipelineRun.metadata?.name}`);

        return {
          success: true,
          result: pipelineRun,
        };
      },
      maxRetries,
      retryDelayMs,
      `SHA ${commitSha} and event type ${eventType}`
    );
  }

  /**
   * Get a PipelineRun by its name
   */
  public async getPipelineRunByName(
    namespace: string,
    name: string
  ): Promise<PipelineRunKind | null> {
    const options = this.kubeClient.createApiOptions(
      this.API_GROUP,
      this.API_VERSION,
      this.PIPELINE_RUNS_PLURAL,
      namespace,
      { name }
    );
    return this.kubeClient.getResource<PipelineRunKind>(options);
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
    gitRepository: string,
    maxRetries: number = 5,
    retryDelayMs: number = 5000
  ): Promise<PipelineRunKind[]> {
    // Validate input parameters
    if (!namespace || namespace.trim() === '') {
      throw new Error('Namespace is required');
    }
    if (!gitRepository || gitRepository.trim() === '') {
      throw new Error('Git repository is required');
    }

    const result = await retryOperation<PipelineRunKind[]>(
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
          return {
            success: false,
            result: [],
            message: `No PipelineRuns found for repository ${gitRepository}`,
          };
        }

        console.log(
          `Found ${pipelineRuns.length} Tekton PipelineRuns for repository: ${gitRepository}`
        );
        return { success: true, result: pipelineRuns };
      },
      maxRetries,
      retryDelayMs,
      `repository ${gitRepository}`
    );

    return result || [];
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
}

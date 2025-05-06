import { KubeClient } from '../../api/ocp/kubeClient';
import { PullRequest } from '../git/models';
import { CI, CIType, EventType, Pipeline, PipelineStatus } from './ciInterface';

/**
 * Base class for all CI implementations with common functionality
 */
export abstract class BaseCI implements CI {
  constructor(
    public readonly ciType: CIType,
    public readonly kubeClient: KubeClient
  ) {}
  public abstract getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null>;

  getPipelineStatus(): Promise<PipelineStatus> {
    throw new Error('Method not implemented.');
  }
  getPipelineLogs(): Promise<string> {
    throw new Error('Method not implemented.');
  }
  getPipelineResults(): Promise<string> {
    throw new Error('Method not implemented.');
  }

  getCIType(): CIType {
    return this.ciType;
  }

  getKubeClient(): KubeClient {
    return this.kubeClient;
  }

  /**
   * Wait for a pipeline to finish executing and return its final status
   * @param pipeline The Pipeline object representing the pipeline to wait for
   * @param timeoutMs Optional timeout in milliseconds
   * @returns A promise that resolves to the final status of the pipeline
   */
  public async waitForPipelineToFinish(
    pipeline: Pipeline,
    timeoutMs: number = 600000
  ): Promise<PipelineStatus> {
    console.log(`Waiting for pipeline ${pipeline.getDisplayName()} to finish...`);

    const startTime = Date.now();
    let status: PipelineStatus = PipelineStatus.UNKNOWN;

    //TODO: need to use retry logic here
    while (!pipeline.isCompleted() && Date.now() - startTime < timeoutMs) {
      // Wait for a short time before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Implement status checking logic specific to each CI type in subclasses
      status = await this.checkPipelineStatus(pipeline);
      pipeline.updateStatus(status);

      console.log(`Pipeline ${pipeline.getDisplayName()} status: ${status}`);
    }

    if (Date.now() - startTime >= timeoutMs) {
      console.warn(`Timed out waiting for pipeline ${pipeline.getDisplayName()} to finish`);
      return PipelineStatus.UNKNOWN;
    }

    return status;
  }

  /**
   * Abstract method to check the status of a pipeline
   * This should be implemented by each CI provider subclass
   */
  protected abstract checkPipelineStatus(pipeline: Pipeline): Promise<PipelineStatus>;

  public abstract waitForAllPipelinesToFinish(): Promise<void>;
}

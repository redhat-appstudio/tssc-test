import { PullRequest } from '../git/models';
import { KubeClient } from './../../../../../src/api/ocp/kubeClient';
import {
  CI,
  CIType,
  EventType,
  Pipeline,
  PipelineStatus,
  CancelPipelineOptions,
  CancelResult,
} from './ciInterface';
import retry from 'async-retry';
import { LoggerFactory } from '../../../../logger/factory/loggerFactory';
import { Logger } from '../../../../logger/logger';

/**
 * Base class for all CI implementations with common functionality
 */
export abstract class BaseCI implements CI {
  protected readonly logger: Logger;
  
  constructor(
    public readonly ciType: CIType,
    public readonly kubeClient: KubeClient
  ) {
    this.logger = LoggerFactory.getLogger('rhtap.core.integration.ci.base');
  }

  /**
   * Get a pipeline for the given pull request
   * @param pullRequest The pull request to get the pipeline for
   * @param eventType Optional event type - some CI systems like Tekton use this to filter pipelines,
   *                  while others like Jenkins may ignore it
   * @param pipelineStatus The status of the pipeline to filter by
   */
  public abstract getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null>;

  public getPipelineStatus(): Promise<PipelineStatus> {
    throw new Error('Method not implemented.');
  }
  public abstract getPipelineLogs(pipeline: Pipeline): Promise<string>;

  public getPipelineResults(): Promise<string> {
    throw new Error('Method not implemented.');
  }

  public getCIType(): CIType {
    return this.ciType;
  }

  /**
   * Normalize CancelPipelineOptions with default values
   * Protected method available to all CI provider subclasses
   */
  protected normalizeOptions(
    options?: CancelPipelineOptions
  ): Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'> {
    return {
      excludePatterns: options?.excludePatterns || [],
      includeCompleted: options?.includeCompleted || false,
      eventType: options?.eventType,
      branch: options?.branch,
      concurrency: options?.concurrency || 10,
      dryRun: options?.dryRun || false,
    };
  }

  /**
   * Utility: Split array into chunks for batch processing
   * Protected method available to all CI provider subclasses
   */
  protected chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  public getKubeClient(): KubeClient {
    return this.kubeClient;
  }

  /**
   * Wait for a pipeline to finish executing and return its final status
   * @param pipeline The Pipeline object representing the pipeline to wait for
   * @param timeoutMs Optional timeout in milliseconds
   * @returns A promise that resolves to the final status of the pipeline
   */
  //TODO: needs one more parameter to specify the final status to wait for
  public async waitForPipelineToFinish(
    pipeline: Pipeline,
    timeoutMs: number = 900000
  ): Promise<PipelineStatus> {
    this.logger.info('Waiting for pipeline {} to finish...', pipeline.getDisplayName());

    let status: PipelineStatus = PipelineStatus.UNKNOWN;
    const startTime = Date.now();

    try {
      const checkPipelineStatus = async (bail: (e: Error) => void): Promise<PipelineStatus> => {
        // Check if timeout has been reached
        if (Date.now() - startTime >= timeoutMs) {
          this.logger.warn('Timed out waiting for pipeline {} to finish', pipeline.getDisplayName());
          bail(new Error('Timeout reached'));
          return PipelineStatus.UNKNOWN;
        }

        // Implement status checking logic specific to each CI type in subclasses
        status = await this.checkPipelinerunStatus(pipeline);
        pipeline.updateStatus(status);

        this.logger.info('Pipeline {} status: {}', pipeline.getDisplayName(), status);

        // If pipeline is not yet complete, throw error to trigger retry
        if (!pipeline.isCompleted()) {
          throw new Error(
            `Pipeline ${pipeline.getDisplayName()} not yet completed, status: ${status}`
          );
        }

        return status;
      };

      status = await retry(checkPipelineStatus, {
        retries: Math.floor(timeoutMs / 30000), // Calculate retries based on timeout
        minTimeout: 30000, // 30 seconds between retries
        maxTimeout: 30000, // Keep consistent timing
        factor: 1, // No backoff
        onRetry: (error: Error, attempt: number) => {
          this.logger.info(
            '[RETRY {}] 🔄 Pipeline: {} | Status: {} | Reason: {}',
            attempt,
            pipeline.getDisplayName(),
            status,
            error.message
          );
        },
      });

      return status;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage === 'Timeout reached') {
        return PipelineStatus.UNKNOWN;
      }
      this.logger.error(
        'Error while waiting for pipeline {}: {}',
        pipeline.getDisplayName(),
        errorMessage
      );
      //TODO: Print out pipeline logs if available
      // This is a placeholder for actual log retrieval logic
      return status;
    }
  }

  /**
   * Abstract method to check the status of a pipeline
   * This should be implemented by each CI provider subclass
   */
  protected abstract checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus>;

  public abstract waitForAllPipelineRunsToFinish(): Promise<void>;

  /**
   * Abstract method for cancelling all pipelines
   * Must be implemented by each provider
   *
   * @param options Optional configuration for filtering and behavior
   * @returns Promise resolving to detailed cancellation results
   */
  public abstract cancelAllPipelines(
    options?: CancelPipelineOptions
  ): Promise<CancelResult>;

  public abstract getWebhookUrl(): Promise<string>;

  public abstract getIntegrationSecret(): Promise<Record<string, string>>;

  public abstract getCIFilePathInRepo(): Promise<string>;
}

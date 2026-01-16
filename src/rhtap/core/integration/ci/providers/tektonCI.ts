import { TektonClient } from '../../../../../api/tekton';
import { KubeClient } from '../../../../../api/ocp/kubeClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { TSSC_CI_NAMESPACE } from '../../../../../constants';
import {
  CIType,
  EventType,
  Pipeline,
  PipelineStatus,
  CancelPipelineOptions,
  CancelResult,
  MutableCancelResult,
  MutablePipelineCancelDetail,
  MutableCancelError,
} from '../ciInterface';
import { PipelineRunKind } from '@janus-idp/shared-react/index';
import retry from 'async-retry';

export class TektonCI extends BaseCI {
  private tektonClient: TektonClient;
  private componentName: string;
  private static readonly CI_NAMESPACE = TSSC_CI_NAMESPACE;

  /**
   * @param componentName The name of the component to associate with this CI instance
   * @param kubeclient The Kubernetes client to use for API calls
   */
  constructor(componentName: string, kubeclient: KubeClient) {
    super(CIType.TEKTON, kubeclient);
    this.componentName = componentName;
    this.tektonClient = new TektonClient(kubeclient);
  }

  /**
   * Get a pipeline for the given pull request based on specified filters
   * Aligns with CI interface; retrieves the latest pipeline run that matches
   * the criteria sorted by creation timestamp
   *
   * @param pullRequest The pull request to get the pipeline for
   * @param pipelineStatus The status of the pipeline to filter by
   * @param eventType event type to filter by (defaults to PULL_REQUEST for Tekton)
   * @returns Promise<Pipeline | null> A standardized Pipeline object or null if not found
   */
  //TODO: this method is a bit complex, consider refactoring for clarity.
  // It should retrieve the pipeline runs for a given pull request based on the event type and commit sha.
  public override async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType: EventType
  ): Promise<Pipeline | null> {
    const effectiveEventType = eventType;
    const gitRepository = pullRequest.repository;

    this.logger.info(
      `Finding pipeline runs for repository: ${gitRepository}, event type: ${effectiveEventType}`
    );

    // Define the pipeline retrieval operation that will be retried
    const findPipelineOperation = async (): Promise<Pipeline | null> => {
      // Get all pipeline runs for this repository
      const allPipelineRuns = await this.tektonClient.getPipelineRunsByGitRepository(
        TektonCI.CI_NAMESPACE,
        gitRepository
      );

      // Check if we have any pipeline runs
      if (!allPipelineRuns || allPipelineRuns.length === 0) {
        this.logger.info(
          `No pipeline runs found yet for repository: ${gitRepository}. Pipeline may still be launching.`
        );
        // Return null to continue the retry process
        return null;
      }

      // Filter pipeline runs by checking if the on-event annotation includes the event type
      const filteredPipelineRuns = allPipelineRuns.filter((pipelineRun: PipelineRunKind) => {
        const annotations = pipelineRun.metadata?.annotations || {};
        const onEvent = annotations['pipelinesascode.tekton.dev/on-event'] || '';
        const commitSha = pipelineRun.metadata?.labels?.['pipelinesascode.tekton.dev/sha'] || '';
        return (
          onEvent.includes(effectiveEventType) &&
          this.mapTektonStatusToPipelineStatus(pipelineRun) === pipelineStatus &&
          commitSha === pullRequest.sha
        );
      });

      // If no matching pipeline runs are found, return null and trigger retry
      if (filteredPipelineRuns.length === 0) {
        this.logger.info(
          `No matching pipeline runs found for event: ${effectiveEventType} with status: ${pipelineStatus}`
        );
        // Return null to trigger retry rather than throwing an error
        return null;
      }

      this.logger.info(`Found ${filteredPipelineRuns.length} matching pipeline runs`);

      // Sort pipeline runs by creation timestamp to get the latest one
      const sortedPipelineRuns = [...filteredPipelineRuns].sort((a, b) => {
        const timeA = a.metadata?.creationTimestamp
          ? new Date(a.metadata.creationTimestamp).getTime()
          : 0;
        const timeB = b.metadata?.creationTimestamp
          ? new Date(b.metadata.creationTimestamp).getTime()
          : 0;
        return timeB - timeA; // Descending order (latest first)
      });

      // Get the latest pipeline run
      const latestPipelineRun = sortedPipelineRuns[0];
      if (!latestPipelineRun) {
        this.logger.info('No pipeline runs available after sorting');
        return null;
      }

      this.logger.info(`Using latest pipeline run: ${latestPipelineRun.metadata?.name}`);

      // Extract relevant data from the pipeline run
      const name = latestPipelineRun.metadata?.name || '';
      const results = latestPipelineRun.status?.results
        ? JSON.stringify(latestPipelineRun.status.results)
        : '';

      // Get URL if available from the log-url annotation
      const url =
        latestPipelineRun.metadata?.annotations?.['pipelinesascode.tekton.dev/log-url'] || '';

      // Map Tekton specific statuses to standardized values
      let status = this.mapTektonStatusToPipelineStatus(latestPipelineRun);

      // Create pipeline using factory method
      return Pipeline.createTektonPipeline(
        name,
        status,
        gitRepository,
        '', // logs not available yet
        results,
        url,
        pullRequest.sha
      );
    };

    // Execute the operation with retries
    const maxRetries = 10;
    try {
      // Retry logic similar to waitForAllPipelinesToFinish
      const result = await retry(
        async (): Promise<Pipeline> => {
          const pipeline = await findPipelineOperation();

          // If no pipeline is found, throw an error to trigger retry
          if (!pipeline) {
            throw new Error(
              `Waiting for pipeline runs for repository: ${gitRepository}, event: ${effectiveEventType}, status: ${pipelineStatus}`
            );
          }

          return pipeline;
        },
        {
          retries: maxRetries,
          minTimeout: 5000,
          maxTimeout: 15000,
          factor: 1.5,
          onRetry: (error: Error, attemptNumber) => {
            // Log retry but don't show the full error stack trace
            this.logger.info(
              `[TEKTON-RETRY ${attemptNumber}/${maxRetries}] 🔄 Repository: ${gitRepository} | Status: ${pipelineStatus} | Reason: {}`
            );
          },
        }
      );

      return result;
    } catch (error: any) {
      // Log a clean message without the full stack trace
      this.logger.info(
        `No matching pipeline found after ${maxRetries} retries for repository: ${gitRepository}, event: ${effectiveEventType}, status: ${pipelineStatus}`
      );
      return null;
    }
  }

  /**
   * Maps Tekton pipeline run status to standardized PipelineStatus
   * Extracted to a separate method for reuse and readability
   */
  private mapTektonStatusToPipelineStatus(pipelineRun: PipelineRunKind): PipelineStatus {
    const condition = pipelineRun.status?.conditions?.[0];
    if (!condition) {
      return PipelineStatus.UNKNOWN;
    }

    const condStatus = condition.status;
    const type = condition.type;
    const reason = condition.reason;

    if (condStatus === 'True' && type === 'Succeeded') {
      return PipelineStatus.SUCCESS;
    } else if (condStatus === 'False' && type === 'Succeeded') {
      return PipelineStatus.FAILURE;
    } else if (condStatus === 'Unknown') {
      if (reason === 'Running' || reason === 'Started') {
        return PipelineStatus.RUNNING;
      } else if (reason === 'Pending') {
        return PipelineStatus.PENDING;
      }
    }

    return PipelineStatus.UNKNOWN;
  }

  /**
   * Implementation of abstract method from BaseCI
   * Returns a standardized pipeline status value compatible with all CI systems
   */
  protected override async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline.name) {
      throw new Error('Pipeline name is required for Tekton pipelines');
    }

    try {
      // Try to get the pipeline run up to 3 times with a 2-second delay between attempts
      let pipelineRun = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (!pipelineRun && attempts < maxAttempts) {
        pipelineRun = await this.tektonClient.getPipelineRunByName(
          TektonCI.CI_NAMESPACE,
          pipeline.name
        );

        if (!pipelineRun) {
          attempts++;
          if (attempts < maxAttempts) {
            this.logger.info(
              `PipelineRun ${pipeline.name} not found, retrying (${attempts}/${maxAttempts})...`
            );
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
          }
        }
      }

      if (!pipelineRun) {
        this.logger.warn(`PipelineRun ${pipeline.name} not found after ${maxAttempts} attempts`);
        return PipelineStatus.UNKNOWN;
      }

      // Extract the primary condition from the PipelineRun
      const condition = pipelineRun.status?.conditions?.[0];
      if (!condition) {
        return PipelineStatus.UNKNOWN;
      }

      // Get the status, type and reason
      const status = condition.status;
      const type = condition.type;
      const reason = condition.reason;

      this.logger.info(
        `PipelineRun ${pipeline.name} status: ${status}, type: ${type}, reason: ${reason}`
      );

      // Map Tekton specific statuses to standardized values
      if (status === 'True' && type === 'Succeeded') {
        return PipelineStatus.SUCCESS;
      } else if (status === 'False' && type === 'Succeeded') {
        return PipelineStatus.FAILURE;
      } else if (status === 'Unknown') {
        if (reason === 'Running' || reason === 'Started') {
          return PipelineStatus.RUNNING;
        } else if (reason === 'Pending') {
          return PipelineStatus.PENDING;
        }
      }
      // Default to unknown if no mapping is found
      return PipelineStatus.UNKNOWN;
    } catch (error) {
      this.logger.error('Error checking pipeline status for {}: {}', pipeline.name, error);
      throw new Error(`Failed to check pipeline status: ${error}`);
    }
  }

  /**
   * Waits for all PipelineRuns associated with the component to finish processing
   *
   * This method identifies all pipeline runs for the current component that are still
   * in progress (not marked with "pipelinesascode.tekton.dev/state=completed"), and
   * waits for each of them to reach a terminal state (success or failure).
   *
   * The method implements robust retry logic based on async-retry pattern:
   * 1. Queries for all pipeline runs associated with the component repository
   * 2. Filters those that don't have the "completed" state label
   * 3. Continues polling with exponential backoff until all pipelines reach completion
   * 4. Handles errors and timeouts gracefully
   *
   * @returns Promise<void> Resolves when all pipelines have reached a terminal state
   * @throws Error if unable to check pipeline status after maximum retries
   */
  public override async waitForAllPipelineRunsToFinish(): Promise<void> {
    this.logger.info(`Waiting for all PipelineRuns to finish for component: ${this.componentName}`);
    const sourceRepoName = this.componentName;

    try {
      // Define the operation to check for running pipelines that will be retried
      const checkPipelines = async (): Promise<void> => {
        try {
          // Get all pipeline runs for the component
          const allPipelineRuns = await this.tektonClient.getPipelineRunsByGitRepository(
            TektonCI.CI_NAMESPACE,
            sourceRepoName
          );

          if (!allPipelineRuns || allPipelineRuns.length === 0) {
            this.logger.info(`No pipeline runs found for repository: ${sourceRepoName}`);
            return; // No pipelines to wait for
          }

          // Filter pipeline runs by checking the label "pipelinesascode.tekton.dev/state"
          const runningPipelineRuns =
            allPipelineRuns.filter((pr: PipelineRunKind) => {
              const state = pr.metadata?.labels?.['pipelinesascode.tekton.dev/state'];
              const name = pr.metadata?.name || 'unknown';
              if (state !== 'completed') {
                this.logger.info(`PipelineRun ${name} still running, state: ${state || 'undefined'}`);
                return true;
              }
              return false;
            }) || [];

          this.logger.info(
            `Found ${runningPipelineRuns.length} running pipeline run(s) for ${sourceRepoName}`
          );

          // If there are running pipelines, throw an error to trigger retry
          if (runningPipelineRuns.length > 0) {
            throw new Error(`Waiting for ${runningPipelineRuns.length} pipeline(s) to complete`);
          }

          // All pipelines are complete, return successfully
          this.logger.info('All pipelines have finished processing.');
          return;
        } catch (error) {
          if (error instanceof Error && error.message.includes('404')) {
            // If it's a 404 error, bail immediately (don't retry)
            this.logger.info(`Repository ${sourceRepoName} not found, no pipelines to wait for`);
            return; // No pipelines to wait for
          }
          // For other errors, throw to trigger retry
          throw error;
        }
      };

      const maxRetries = 20; // Maximum number of retries
      await retry(checkPipelines, {
        retries: maxRetries, // Maximum 20 retries
        minTimeout: 10000, // Start with a 10 second delay
        maxTimeout: 30000, // Maximum timeout between retries
        factor: 1.5, // Exponential backoff factor
        onRetry: (error: Error, attempt: number) => {
          this.logger.info(
            `[TEKTON-RETRY ${attempt}/${maxRetries}] 🔄 Repository: ${sourceRepoName} | Status: Waiting | Reason: {}`
          );
        },
      });
    } catch (error: unknown) {
      const errorMessage = error;
      this.logger.error(
        `Failed to wait for all pipelines to complete for repository ${sourceRepoName} after multiple retries: ${errorMessage}`
      );
      // Return without throwing to make error handling easier for callers
      // This is a change from the original implementation which threw an error
      this.logger.info('Continuing despite pipeline completion check failures');
    }
  }



  public override async getWebhookUrl(): Promise<string> {
    const tektonWebhookUrl = await this.kubeClient.getOpenshiftRoute(
      'pipelines-as-code-controller',
      'openshift-pipelines'
    );
    return `https://${tektonWebhookUrl}`;
  }

  public override async getIntegrationSecret(): Promise<Record<string, string>> {
    throw new Error(
      'Tekton does not support integration secrets in the same way as other CI systems.'
    );
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return '.tekton';
  }

  public override async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    if (!pipeline.name) {
      throw new Error('Pipeline name is required for Tekton pipelines');
    }

    try {
      const logs = await this.tektonClient.getPipelineRunLogs(TektonCI.CI_NAMESPACE, pipeline.name);
      if (!logs) {
        throw new Error(`No logs found for pipeline: ${pipeline.name}`);
      }
      return logs;
    } catch (error) {
      this.logger.error('Error getting pipeline logs for {}: {}', pipeline.name, error);
      throw new Error(`Failed to get pipeline logs: ${error}`);
    }
  }

  /**
   * Cancel all pipelines for this component with optional filtering
   */
  public override async cancelAllPipelines(
    options?: CancelPipelineOptions
  ): Promise<CancelResult> {
    // 1. Normalize options with defaults
    const opts = this.normalizeOptions(options);

    // 2. Initialize result object
    const result: MutableCancelResult = {
      total: 0,
      cancelled: 0,
      failed: 0,
      skipped: 0,
      details: [],
      errors: [],
    };

    this.logger.info(`[Tekton] Starting pipeline cancellation for ${this.componentName}`);

    try {
      // 3. Fetch all PipelineRuns from Tekton API
      const allPipelineRuns = await this.fetchAllPipelineRuns();
      result.total = allPipelineRuns.length;

      if (allPipelineRuns.length === 0) {
        this.logger.info(`[Tekton] No PipelineRuns found for ${this.componentName}`);
        return result;
      }

      this.logger.info(`[Tekton] Found ${allPipelineRuns.length} total PipelineRuns`);

      // 4. Apply filters
      const pipelineRunsToCancel = this.filterPipelineRuns(allPipelineRuns, opts);

      this.logger.info(`[Tekton] ${pipelineRunsToCancel.length} PipelineRuns match filters`);
      this.logger.info(`[Tekton] ${allPipelineRuns.length - pipelineRunsToCancel.length} PipelineRuns filtered out`);

      // 5. Cancel PipelineRuns in batches
      await this.cancelPipelineRunsInBatches(pipelineRunsToCancel, opts, result);

      // 6. Validate result counts (accounting invariant)
      const accounted = result.cancelled + result.failed + result.skipped;
      if (accounted !== result.total) {
        const missing = result.total - accounted;
        this.logger.error(
          `❌ [Tekton] ACCOUNTING ERROR: ${missing} PipelineRuns unaccounted for ` +
          `(total: ${result.total}, accounted: ${accounted})`
        );

        result.errors.push({
          pipelineId: 'ACCOUNTING_ERROR',
          message: `${missing} PipelineRuns lost in processing`,
          error: new Error('Result count mismatch - this indicates a bug in the cancellation logic'),
        });
      }

      // 7. Log summary
      this.logger.info(`[Tekton] Cancellation complete:`, {
        total: result.total,
        cancelled: result.cancelled,
        failed: result.failed,
        skipped: result.skipped,
      });

    } catch (error: any) {
      this.logger.error('[Tekton] Error in cancelAllPipelines: {}', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to cancel pipelines: ${errMsg}`);
    }

    return result;
  }



  /**
   * Fetch all PipelineRuns from Tekton API (both source and gitops repos)
   */
  private async fetchAllPipelineRuns(): Promise<any[]> {
    try {
      const allPipelineRuns: any[] = [];

      // Fetch PipelineRuns from source repository (errors should propagate for main repo)
      const sourceRepoName = this.componentName;
      const sourcePipelineRuns = await this.tektonClient.getPipelineRunsByGitRepository(
        TektonCI.CI_NAMESPACE,
        sourceRepoName
      );

      // Tag PipelineRuns with their repository name for later cancellation
      const taggedSourcePipelineRuns = (sourcePipelineRuns || []).map(pr => ({
        ...pr,
        _repositoryName: sourceRepoName
      }));
      allPipelineRuns.push(...taggedSourcePipelineRuns);

      // Fetch PipelineRuns from gitops repository
      const gitopsRepoName = `${this.componentName}-gitops`;
      try {
        const gitopsPipelineRuns = await this.tektonClient.getPipelineRunsByGitRepository(
          TektonCI.CI_NAMESPACE,
          gitopsRepoName
        );

        // Tag PipelineRuns with their repository name for later cancellation
        const taggedGitopsPipelineRuns = (gitopsPipelineRuns || []).map(pr => ({
          ...pr,
          _repositoryName: gitopsRepoName
        }));
        allPipelineRuns.push(...taggedGitopsPipelineRuns);
      } catch (gitopsError: any) {
        // Gitops repository might not exist, log but don't fail
        this.logger.info(`[Tekton] Gitops repository ${gitopsRepoName} not found or no PipelineRuns: ${gitopsError.message}`);
      }

      return allPipelineRuns;

    } catch (error: any) {
      this.logger.error('[Tekton] Failed to fetch PipelineRuns: {}', error);
      throw error;
    }
  }

  /**
   * Filter PipelineRuns based on cancellation options
   */
  private filterPipelineRuns(
    pipelineRuns: any[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>
  ): any[] {
    return pipelineRuns.filter(pr => {
      const prName = pr.metadata?.name || 'unknown';

      // Filter 1: Skip completed PipelineRuns unless includeCompleted is true
      if (!options.includeCompleted && this.isCompletedStatus(pr)) {
        const state = pr.metadata?.labels?.['pipelinesascode.tekton.dev/state'];
        this.logger.info(`[Filter] Skipping completed PipelineRun ${prName} (state: ${state})`);
        return false;
      }

      // Filter 2: Check exclusion patterns
      if (this.matchesExclusionPattern(pr, options.excludePatterns)) {
        this.logger.info(`[Filter] Excluding PipelineRun ${prName} by pattern`);
        return false;
      }

      // Filter 3: Filter by event type if specified
      if (options.eventType && !this.matchesEventType(pr, options.eventType)) {
        const eventType = pr.metadata?.labels?.['pipelinesascode.tekton.dev/event-type'];
        this.logger.info(`[Filter] Skipping PipelineRun ${prName} (event type: ${eventType} doesn't match ${options.eventType})`);
        return false;
      }

      // Filter 4: Filter by branch if specified
      if (options.branch) {
        const branch = pr.metadata?.labels?.['pipelinesascode.tekton.dev/branch'];
        if (branch !== options.branch) {
          this.logger.info(`[Filter] Skipping PipelineRun ${prName} (branch: ${branch} doesn't match ${options.branch})`);
          return false;
        }
      }

      return true; // Include this PipelineRun for cancellation
    });
  }

  /**
   * Check if PipelineRun status is completed
   */
  private isCompletedStatus(pipelineRun: any): boolean {
    const state = pipelineRun.metadata?.labels?.['pipelinesascode.tekton.dev/state'];
    return state === 'completed';
  }

  /**
   * Check if PipelineRun matches any exclusion pattern
   */
  private matchesExclusionPattern(pipelineRun: any, patterns: ReadonlyArray<RegExp>): boolean {
    if (patterns.length === 0) {
      return false;
    }

    const prName = pipelineRun.metadata?.name || 'unknown';

    return patterns.some(pattern => pattern.test(prName));
  }

  /**
   * Check if PipelineRun matches the event type
   * Tekton uses labels to indicate event type
   */
  private matchesEventType(pipelineRun: any, eventType: EventType): boolean {
    const tektonEventType = pipelineRun.metadata?.labels?.['pipelinesascode.tekton.dev/event-type'];
    
    if (!tektonEventType) {
      return true; // If no event type label, allow all
    }

    switch (eventType) {
      case EventType.PUSH:
        return tektonEventType === 'push';
      case EventType.PULL_REQUEST:
        return tektonEventType === 'pull_request';
      default:
        return false;
    }
  }

  /**
   * Cancel PipelineRuns in batches with concurrency control
   */
  private async cancelPipelineRunsInBatches(
    pipelineRuns: any[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Split into batches
    const batches = this.chunkArray(pipelineRuns, options.concurrency);

    this.logger.info(`[Tekton] Processing ${batches.length} batches with concurrency ${options.concurrency}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`[Tekton] Processing batch ${i + 1}/${batches.length} (${batch.length} PipelineRuns)`);

      // Create promises for all PipelineRuns in this batch
      const promises = batch.map(pr =>
        this.cancelSinglePipelineRun(pr, options, result)
      );

      // Wait for all in batch to complete (don't stop on errors)
      const batchResults = await Promise.allSettled(promises);

      // Inspect batch results for systemic failures
      const batchSuccesses = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailures = batchResults.filter(r => r.status === 'rejected').length;

      this.logger.info(`[Tekton] Batch ${i + 1}/${batches.length} complete: ${batchSuccesses} succeeded, ${batchFailures} rejected`);

      // Alert on complete batch failure - indicates systemic issue
      if (batchFailures === batch.length && batch.length > 0) {
        this.logger.error(`❌ [Tekton] ENTIRE BATCH ${i + 1} FAILED - possible systemic issue (auth, network, or API problem)`);

        // Log first rejection reason for debugging
        const firstRejected = batchResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstRejected) {
          this.logger.error(`[Tekton] First failure reason: ${firstRejected.reason}`);
        }
      }
    }
  }

  /**
   * Cancel a single PipelineRun and update results
   */
  private async cancelSinglePipelineRun(
    pipelineRun: any,
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    const prName = pipelineRun.metadata?.name || 'unknown';
    
    // Initialize detail object
    const detail: MutablePipelineCancelDetail = {
      pipelineId: prName,
      name: prName,
      status: this.mapTektonStatusToPipelineStatus(pipelineRun),
      result: 'skipped',
      eventType: this.mapTektonEventType(pipelineRun),
    };

    try {
      if (options.dryRun) {
        // Dry run mode - don't actually cancel
        detail.result = 'skipped';
        detail.reason = 'Dry run mode';
        result.skipped++;
        this.logger.info(`[DryRun] Would cancel PipelineRun ${prName}`);

      } else {
        // Extract repository name from tagged PipelineRun (added in fetchAllPipelineRuns)
        const repositoryName = (pipelineRun as any)._repositoryName || this.componentName;

        // Actually cancel the PipelineRun via Tekton API
        await this.cancelPipelineRunViaAPI(prName);

        detail.result = 'cancelled';
        result.cancelled++;
        const state = pipelineRun.metadata?.labels?.['pipelinesascode.tekton.dev/state'];
        this.logger.info(`✅ [Tekton] Cancelled PipelineRun ${prName} in ${repositoryName} (state: ${state || 'unknown'})`);
      }

    } catch (error: any) {
      // Cancellation failed
      detail.result = 'failed';
      detail.reason = error.message;
      result.failed++;

      // Add to errors array
      const cancelError: MutableCancelError = {
        pipelineId: prName,
        message: error.message,
        error: error,
      };

      result.errors.push(cancelError);

      this.logger.error('❌ [Tekton] Failed to cancel PipelineRun {}: {}', prName, error);
    }

    // Add detail to results
    result.details.push(detail);
  }

  /**
   * Actually cancel the PipelineRun via Tekton API
   */
  private async cancelPipelineRunViaAPI(pipelineRunName: string): Promise<void> {
    try {
      await this.tektonClient.cancelPipelineRun(TektonCI.CI_NAMESPACE, pipelineRunName);

    } catch (error: any) {
      // Re-throw - the tektonClient.cancelPipelineRun already has error handling
      throw error;
    }
  }

  /**
   * Map Tekton PipelineRun to EventType
   */
  private mapTektonEventType(pipelineRun: any): EventType | undefined {
    const eventType = pipelineRun.metadata?.labels?.['pipelinesascode.tekton.dev/event-type'];
    
    if (eventType === 'push') {
      return EventType.PUSH;
    }
    if (eventType === 'pull_request') {
      return EventType.PULL_REQUEST;
    }
    return undefined;
  }


}

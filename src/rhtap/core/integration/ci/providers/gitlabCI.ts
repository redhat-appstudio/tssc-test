import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { GitLabClient, GitLabConfigBuilder } from '../../../../../api/gitlab';
// import { GitLabClient } from '../../../../../api/git/gitlabClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
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
import retry from 'async-retry';

export class GitLabCI extends BaseCI {
  private componentName: string;
  private secret!: Record<string, string>;
  private baseUrl: string = '';
  private gitlabCIClient!: GitLabClient;
  // private gitlabClient!: GitLabClient;
  private gitOpsRepoName: string;
  private sourceRepoName: string;

  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.GITLABCI, kubeClient);
    this.componentName = componentName;
    this.sourceRepoName = componentName;
    this.gitOpsRepoName = `${componentName}-gitops`;
  }

  private async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-gitlab-integration', 'tssc');
    if (!secret) {
      throw new Error('GitLab secret not found in the cluster. Please ensure the secret exists.');
    }
    this.secret = secret;
    return secret;
  }

  public async initialize(): Promise<void> {
    await this.loadSecret();
    this.gitlabCIClient = await this.initGitlabCIClient();
    // this.gitlabClient = this.gitlabCIClient.getGitlabClient();
  }

  /**
   * Initialize GitLab client with token
   * @returns Promise with GitLab client
   */
  private async initGitlabCIClient(): Promise<GitLabClient> {
    const gitlabToken = this.getToken();
    const hostname = this.getHost();
    this.baseUrl = `https://${hostname}`;
    // Initialize the GitLab client with the new config pattern
    const config = GitLabConfigBuilder
      .create(this.baseUrl, gitlabToken)
      .build();
    const gitlabCIClient = new GitLabClient(config);
    return gitlabCIClient;
  }

  public getToken(): string {
    if (!this.secret?.token) {
      throw new Error('GitLab token not found in the secret. Please ensure the token is provided.');
    }
    return this.secret.token;
  }

  public getHost(): string {
    if (!this.secret?.host) {
      throw new Error(`Host not found in the secret. Please ensure the host is provided.`);
    }
    return this.secret.host;
  }

  public getGroup(): string {
    if (!this.secret?.group) {
      throw new Error('GitLab group not found in the secret. Please ensure the group is provided.');
    }
    return this.secret.group;
  }

  public override async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    try {
      // Convert our standardized status to GitLab status strings to filter pipelines
      // the Mapping needs to be updated according GitLab status names
      const gitlabStatusMap: Record<PipelineStatus, string | null> = {
        [PipelineStatus.SUCCESS]: 'success',
        [PipelineStatus.FAILURE]: 'failed',
        [PipelineStatus.RUNNING]: 'running',
        [PipelineStatus.PENDING]: 'pending',
        [PipelineStatus.CANCELLED]: 'canceled',
        [PipelineStatus.UNKNOWN]: null, // No direct mapping, will fetch all statuses
      };

      // Get GitLab status filter or null if no direct mapping
      const gitlabStatus = gitlabStatusMap[pipelineStatus];

      // Fetch pipelines for the repository and commit SHA
      let pipelines = await this.gitlabCIClient.pipelines.getPipelines(
        `${this.getGroup()}/${pullRequest.repository}`,
        {
          sha: pullRequest.sha,
          ...(gitlabStatus && { status: gitlabStatus })
        }
      );

      if (!pipelines || pipelines.length === 0) {
        this.logger.info(
          `No pipelines found for repository ${pullRequest.repository} with SHA ${pullRequest.sha}`
        );
        return null;
      }

      // Filter pipelines by the requested event type if provided, the event type maps the GitLab pipeline source property
      if (eventType === EventType.PULL_REQUEST || eventType === EventType.PUSH) {
        pipelines.map(pipeline => {
          this.logger.info(`Pipeline ID: ${pipeline.id}, Source: ${pipeline.source}`);
        });
        pipelines = pipelines.filter(
          pipeline => pipeline.source === 'push' || pipeline.source === 'merge_request_event'
        );

        // Check if pipelines array is empty after filtering
        if (pipelines.length === 0) {
          this.logger.info(
            `No pipelines found for repository ${pullRequest.repository} with SHA ${pullRequest.sha} after filtering by event type`
          );
          return null;
        }
      }

      // Find the most recent pipeline by updated_at timestamp
      pipelines.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const latestPipeline = pipelines[0];
      //TODO: for debugging purpose, remove it later
      this.logger.info(`Latest pipeline ID: ${latestPipeline.id}, Source: ${latestPipeline.source}`);
      const mappedStatus = this.mapPipelineStatus(latestPipeline.status);

      // Only return pipelines that match the requested status if it's not UNKNOWN
      if (pipelineStatus !== PipelineStatus.UNKNOWN && mappedStatus !== pipelineStatus) {
        this.logger.info(
          `Latest pipeline status ${mappedStatus} doesn't match requested status ${pipelineStatus}`
        );
        return null;
      }

      // Convert GitLab pipeline to our standardized Pipeline object
      return Pipeline.createGitLabPipeline(
        latestPipeline.id,
        mappedStatus,
        pullRequest.repository,
        '', // Logs will be fetched separately when needed
        JSON.stringify(latestPipeline), // Store raw pipeline data in results
        latestPipeline.web_url,
        latestPipeline.sha
      );
    } catch (error) {
      this.logger.error(`Error fetching GitLab pipelines: ${error}`);
      return null;
    }
  }

  // the following is the status of pipelines:
  // created, waiting_for_resource, preparing, pending, running, success, failed, canceled, skipped, manual, scheduled.
  // so we think that "success", "failed", "canceled", and "skipped" represent a completed state for the pipeline.
  protected override async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline) {
      throw new Error('Pipeline is not defined');
    }

    try {
      // Get the latest pipeline status from GitLab
      const pipelineId = parseInt(pipeline.id, 10);
      if (isNaN(pipelineId)) {
        throw new Error(`Invalid pipeline ID: ${pipeline.id}`);
      }

      // Get updated pipeline information from GitLab
      const gitlabPipeline = await this.gitlabCIClient.pipelines.getPipelineById(
        `${this.getGroup()}/${pipeline.repositoryName}`,
        pipelineId
      );

      // Handle completed states according to GitLab's definition
      // success, failed, canceled, and skipped represent a completed state
      const gitlabStatus = gitlabPipeline.status.toLowerCase();
      if (gitlabStatus === 'success') {
        return PipelineStatus.SUCCESS;
      } else if (gitlabStatus === 'failed' || gitlabStatus === 'canceled') {
        return PipelineStatus.FAILURE;
      } else if (gitlabStatus === 'skipped') {
        // For skipped pipelines, we map to FAILURE to ensure they're considered "completed"
        // This ensures consistency with the waitForAllPipelinesToFinish method
        return PipelineStatus.FAILURE;
      }

      // For all other statuses, use the standard mapping
      const mappedStatus = this.mapPipelineStatus(gitlabStatus);
      return mappedStatus;
    } catch (error) {
      this.logger.error(`Error checking pipeline status for ${pipeline.id}: ${error}`);
      return PipelineStatus.UNKNOWN;
    }
  }

  public override async waitForAllPipelineRunsToFinish(): Promise<void> {
    try {
      this.logger.info(
        `Waiting for all GitLab CI pipelines for component ${this.componentName} to finish...`
      );
      const maxAttempts = 20;
      const pollIntervalMs = 5000; // Poll every 5 seconds

      // Define the operation to check for running pipelines
      const checkPipelines = async (): Promise<boolean> => {
        // Get all pipelines for the component repository
        const allPipelines = await this.gitlabCIClient.pipelines.getAllPipelines(
          `${this.getGroup()}/${this.sourceRepoName}`
        );

        if (!allPipelines || allPipelines.length === 0) {
          this.logger.info(`No pipelines found for component ${this.componentName}`);
          return true;
        }

        // the following is the status of pipelines:
        // created, waiting_for_resource, preparing, pending, running, success, failed, canceled, skipped, manual, scheduled.
        // so we think that "success", "failed", "canceled", and "skipped" represent a completed state for the pipeline.
        const allIncompletePipelines = allPipelines.filter(
          pipeline =>
            pipeline.status !== 'success' &&
            pipeline.status !== 'failed' &&
            pipeline.status !== 'canceled' &&
            pipeline.status !== 'skipped'
        );

        if (allIncompletePipelines.length === 0) {
          this.logger.info(`No running or pending pipelines found for component ${this.componentName}`);
          return true;
        }

        this.logger.info(
          `Found ${allIncompletePipelines.length} active pipelines for component ${this.componentName}`
        );

        // If there are incomplete pipelines, throw an error to trigger retry
        throw new Error(`Waiting for ${allIncompletePipelines.length} pipeline(s) to complete`);
      };

      // Run the operation with retries
      try {
        await retry(checkPipelines, {
          retries: maxAttempts,
          minTimeout: pollIntervalMs,
          onRetry: (error: Error, attemptNumber: number) => {
            this.logger.info(
              `[GITLAB-CI-RETRY ${attemptNumber}/${maxAttempts}] 🔄 Component: ${this.componentName} | Status: Waiting | Reason: ${error.message}`
            );
          },
        });

        this.logger.info(
          `All GitLab CI pipelines for component ${this.componentName} have finished processing.`
        );
      } catch (error: any) {
        this.logger.info(
          `Timeout reached. Some pipeline(s) still running after ${maxAttempts} attempts.`
        );
      }
    } catch (error) {
      this.logger.error(`Error waiting for GitLab CI pipelines to finish: ${error}`);
      throw new Error(`Failed to wait for pipelines: ${error}`);
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

    this.logger.info(`[GitLabCI] Starting pipeline cancellation for ${this.componentName}`);

    try {
      // 3. Fetch all pipelines from GitLab API
      const allPipelines = await this.fetchAllPipelines();
      result.total = allPipelines.length;

      if (allPipelines.length === 0) {
        this.logger.info(`[GitLabCI] No pipelines found for ${this.componentName}`);
        return result;
      }

      this.logger.info(`[GitLabCI] Found ${allPipelines.length} total pipelines`);

      // 4. Apply filters
      const pipelinesToCancel = this.filterPipelines(allPipelines, opts);

      this.logger.info(`[GitLabCI] ${pipelinesToCancel.length} pipelines match filters`);
      this.logger.info(`[GitLabCI] ${allPipelines.length - pipelinesToCancel.length} pipelines filtered out`);

      // 5. Cancel pipelines in batches
      await this.cancelPipelinesInBatches(pipelinesToCancel, opts, result);

      // 6. Validate result counts (accounting invariant)
      const accounted = result.cancelled + result.failed + result.skipped;
      if (accounted !== result.total) {
        const missing = result.total - accounted;
        this.logger.error(
          `❌ [GitLabCI] ACCOUNTING ERROR: ${missing} pipelines unaccounted for ` +
          `(total: ${result.total}, accounted: ${accounted})`
        );

        // Add accounting error to errors array
        result.errors.push({
          pipelineId: 'ACCOUNTING_ERROR',
          message: `${missing} pipelines lost in processing`,
          error: new Error('Result count mismatch - this indicates a bug in the cancellation logic'),
        });
      }

      // 7. Log summary
      this.logger.info(`[GitLabCI] Cancellation complete:`, {
        total: result.total,
        cancelled: result.cancelled,
        failed: result.failed,
        skipped: result.skipped,
      });

    } catch (error: any) {
      this.logger.error(`[GitLabCI] Error in cancelAllPipelines: ${error.message}`);
      throw new Error(`Failed to cancel pipelines: ${error.message}`);
    }

    return result;
  }



  /**
   * Fetch all pipelines from GitLab API (both source and gitops repos)
   */
  private async fetchAllPipelines(): Promise<any[]> {
    try {
      const allPipelines: any[] = [];

      // Fetch from source repository
      const sourceProjectPath = `${this.getGroup()}/${this.sourceRepoName}`;
      try {
        const sourcePipelines = await this.gitlabCIClient.pipelines.getAllPipelines(sourceProjectPath);

        // Tag pipelines with their project path for later cancellation
        const taggedSourcePipelines = (sourcePipelines || []).map(p => ({
          ...p,
          _projectPath: sourceProjectPath
        }));
        allPipelines.push(...taggedSourcePipelines);
      } catch (sourceError: any) {
        // Source repo might not exist or have no pipelines, log but don't fail
        this.logger.info(`[GitLabCI] Source repository ${sourceProjectPath} not found or no pipelines: ${sourceError.message}`);
      }

      // Fetch from gitops repository
      const gitopsProjectPath = `${this.getGroup()}/${this.gitOpsRepoName}`;
      try {
        const gitopsPipelines = await this.gitlabCIClient.pipelines.getAllPipelines(gitopsProjectPath);

        // Tag pipelines with their project path for later cancellation
        const taggedGitopsPipelines = (gitopsPipelines || []).map(p => ({
          ...p,
          _projectPath: gitopsProjectPath
        }));
        allPipelines.push(...taggedGitopsPipelines);
      } catch (gitopsError: any) {
        // Gitops repo might not exist, log but don't fail
        this.logger.info(`[GitLabCI] Gitops repository ${gitopsProjectPath} not found or no pipelines: ${gitopsError.message}`);
      }

      return allPipelines;

    } catch (error: any) {
      this.logger.error(`[GitLabCI] Failed to fetch pipelines: ${error}`);
      throw error;
    }
  }

  /**
   * Filter pipelines based on cancellation options
   */
  private filterPipelines(
    pipelines: any[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>
  ): any[] {
    return pipelines.filter(pipeline => {
      // Filter 1: Skip completed pipelines unless includeCompleted is true
      if (!options.includeCompleted && this.isCompletedStatus(pipeline.status)) {
        this.logger.info(`[Filter] Skipping completed pipeline ${pipeline.id} (${pipeline.status})`);
        return false;
      }

      // Filter 2: Check exclusion patterns
      if (this.matchesExclusionPattern(pipeline, options.excludePatterns)) {
        this.logger.info(`[Filter] Excluding pipeline ${pipeline.id} by pattern`);
        return false;
      }

      // Filter 3: Filter by event type if specified
      if (options.eventType && !this.matchesEventType(pipeline, options.eventType)) {
        this.logger.info(`[Filter] Skipping pipeline ${pipeline.id} (event type mismatch)`);
        return false;
      }

      // Filter 4: Filter by branch if specified
      if (options.branch && pipeline.ref !== options.branch) {
        this.logger.info(`[Filter] Skipping pipeline ${pipeline.id} (branch mismatch)`);
        return false;
      }

      return true; // Include this pipeline for cancellation
    });
  }

  /**
   * Check if pipeline status is completed
   */
  private isCompletedStatus(status: string): boolean {
    const completedStatuses = ['success', 'failed', 'canceled', 'skipped', 'manual'];
    return completedStatuses.includes(status.toLowerCase());
  }

  /**
   * Check if pipeline matches any exclusion pattern
   */
  private matchesExclusionPattern(pipeline: any, patterns: ReadonlyArray<RegExp>): boolean {
    if (patterns.length === 0) {
      return false;
    }

    const pipelineName = `Pipeline-${pipeline.id}`;
    const branch = pipeline.ref || '';

    return patterns.some(pattern =>
      pattern.test(pipelineName) || pattern.test(branch)
    );
  }

  /**
   * Check if pipeline matches the event type
   */
  private matchesEventType(pipeline: any, eventType: EventType): boolean {
    // GitLab uses 'source' field to indicate trigger type
    switch (eventType) {
      case EventType.PUSH:
        return pipeline.source === 'push';
      case EventType.PULL_REQUEST:
        return pipeline.source === 'merge_request_event';
      default:
        return false;
    }
  }

  /**
   * Cancel pipelines in batches with concurrency control
   */
  private async cancelPipelinesInBatches(
    pipelines: any[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Split into batches
    const batches = this.chunkArray(pipelines, options.concurrency);

    this.logger.info(`[GitLabCI] Processing ${batches.length} batches with concurrency ${options.concurrency}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`[GitLabCI] Processing batch ${i + 1}/${batches.length} (${batch.length} pipelines)`);

      // Create promises for all pipelines in this batch
      const promises = batch.map(pipeline =>
        this.cancelSinglePipeline(pipeline, options, result)
      );

      // Wait for all in batch to complete (don't stop on errors)
      const batchResults = await Promise.allSettled(promises);

      // Inspect batch results for systemic failures
      const batchSuccesses = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailures = batchResults.filter(r => r.status === 'rejected').length;

      this.logger.info(`[GitLabCI] Batch ${i + 1}/${batches.length} complete: ${batchSuccesses} succeeded, ${batchFailures} rejected`);

      // Alert on complete batch failure - indicates systemic issue
      if (batchFailures === batch.length && batch.length > 0) {
        this.logger.error(`❌ [GitLabCI] ENTIRE BATCH ${i + 1} FAILED - possible systemic issue (auth, network, or API problem)`);

        // Log first rejection reason for debugging
        const firstRejected = batchResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstRejected) {
          this.logger.error(`[GitLabCI] First failure reason: ${firstRejected.reason}`);
        }
      }
    }
  }

  /**
   * Cancel a single pipeline and update results
   */
  private async cancelSinglePipeline(
    pipeline: any,
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Initialize detail object
    const detail: MutablePipelineCancelDetail = {
      pipelineId: pipeline.id,
      name: `Pipeline-${pipeline.id}`,
      status: this.mapPipelineStatus(pipeline.status),
      result: 'skipped',
      branch: pipeline.ref,
      eventType: this.mapGitLabEventType(pipeline),
    };

    try {
      if (options.dryRun) {
        // Dry run mode - don't actually cancel
        detail.result = 'skipped';
        detail.reason = 'Dry run mode';
        result.skipped++;
        this.logger.info(`[DryRun] Would cancel pipeline ${pipeline.id}`);

      } else {
        // Extract project path from tagged pipeline (added in fetchAllPipelines)
        const projectPath = pipeline._projectPath || `${this.getGroup()}/${this.sourceRepoName}`;

        // Actually cancel the pipeline via GitLab API
        await this.cancelPipelineViaAPI(pipeline.id, projectPath);

        detail.result = 'cancelled';
        result.cancelled++;
        this.logger.info(`✅ [GitLabCI] Cancelled pipeline ${pipeline.id} in ${projectPath} (status: ${pipeline.status})`);
      }

    } catch (error: any) {
      // Cancellation failed
      detail.result = 'failed';
      detail.reason = error.message;
      result.failed++;

      // Add to errors array
      const cancelError: MutableCancelError = {
        pipelineId: pipeline.id,
        message: error.message,
        error: error,
      };

      // Add status code if available
      if (error.response?.status) {
        cancelError.statusCode = error.response.status;
      }

      // Add provider error code if available
      if (error.response?.data?.error) {
        cancelError.providerErrorCode = error.response.data.error;
      }

      result.errors.push(cancelError);

      this.logger.error(`❌ [GitLabCI] Failed to cancel pipeline ${pipeline.id}: ${error}`);
    }

    // Add detail to results
    result.details.push(detail);
  }

  /**
   * Actually cancel the pipeline via GitLab API
   */
  private async cancelPipelineViaAPI(pipelineId: number, projectPath: string): Promise<void> {
    try {
      await this.gitlabCIClient.pipelines.cancelPipeline(projectPath, pipelineId);

    } catch (error: any) {
      // Handle GitLab-specific errors
      if (error.response?.status === 404) {
        throw new Error('Pipeline not found (may have been deleted)');
      }
      if (error.response?.status === 403) {
        throw new Error('Insufficient permissions to cancel pipeline');
      }
      if (error.response?.data?.message) {
        throw new Error(`GitLab API error: ${error.response.data.message}`);
      }

      throw error;
    }
  }

  /**
   * Map GitLab pipeline to EventType
   */
  private mapGitLabEventType(pipeline: any): EventType | undefined {
    if (pipeline.source === 'push') {
      return EventType.PUSH;
    }
    if (pipeline.source === 'merge_request_event') {
      return EventType.PULL_REQUEST;
    }
    return undefined;
  }



  public override async getWebhookUrl(): Promise<string> {
    throw new Error('GitLab does not support webhooks in the same way as other CI systems.');
  }

  public override getIntegrationSecret(): Promise<Record<string, string>> {
    return Promise.resolve(this.secret);
  }

  public override async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    const pipelineId = parseInt(pipeline.id);
    if (isNaN(pipelineId)) {
      throw new Error(`Invalid pipeline ID: ${pipeline.id}`);
    }
    return this.gitlabCIClient.pipelines.getPipelineLogs(
      `${this.getGroup()}/${pipeline.repositoryName}`,
      pipelineId
    );
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return '.gitlab-ci.yml';
  }

  /**
   * Maps GitLab pipeline status to our standardized PipelineStatus enum
   * @param gitlabStatus The status string from GitLab API
   * @returns The standardized PipelineStatus value
   */
  public mapPipelineStatus(gitlabStatus: string): PipelineStatus {
    switch (gitlabStatus) {
      case 'success':
        return PipelineStatus.SUCCESS;
      case 'failed':
      case 'canceled':
        return PipelineStatus.FAILURE;
      case 'running':
        return PipelineStatus.RUNNING;
      case 'pending':
      case 'created':
      case 'waiting_for_resource':
      case 'preparing':
      case 'manual':
      case 'scheduled':
        return PipelineStatus.PENDING;
      case 'skipped':
        return PipelineStatus.FAILURE; // Treat skipped as failure for consistency
      default:
        return PipelineStatus.UNKNOWN;
    }
  }
}

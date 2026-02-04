import {
  WorkflowRun,
  WorkflowRunFilter,
} from '../../../../../api/github/types/github.types';
import { GithubClient } from '../../../../../api/github';
import { KubeClient } from '../../../../../api/ocp/kubeClient';
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

export class GitHubActionsCI extends BaseCI {
  private githubClient!: GithubClient;
  private componentName: string;
  private secret?: Record<string, string>;
  private repoOwner!: string;

  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.GITHUB_ACTIONS, kubeClient);
    this.componentName = componentName;
  }

  public async getIntegrationSecret(): Promise<Record<string, string>> {
    if (this.secret) {
      return this.secret;
    }
    // Load the secret from the provider-specific implementation
    this.secret = await this.loadSecret();
    return this.secret;
  }

  public getRepoOwner(): string {
    if (!this.repoOwner) {
      throw new Error(
        'Repository owner is not set. Please ensure the GitHub client is initialized.'
      );
    }
    return this.repoOwner;
  }

  public setRepoOwner(repoOwner: string): void {
    if (!repoOwner) {
      throw new Error('Repository owner cannot be empty.');
    }
    this.repoOwner = repoOwner;
  }

  public async initialize(): Promise<void> {
    this.secret = await this.loadSecret();
    this.githubClient = new GithubClient({ token: this.getToken() });
  }

  /**
   * Loads GitHub integration secrets from Kubernetes
   * @returns Promise with the secret data
   */
  private async loadSecret(): Promise<Record<string, string>> {
    

    // Otherwise load from Kubernetes
    const secret = await this.kubeClient.getSecret('tssc-github-integration', 'tssc');
    if (!secret) {
      throw new Error(
        'GitHub integration secret not found in the cluster. Please ensure the secret exists.'
      );
    }

    

    return secret;
  }


  public getToken(): string {
    if (!this.secret?.token) {
      throw new Error('GitHub token not found in the secret. Please ensure the token is provided.');
    }
    return this.secret.token;
  }
  /**
   * Get a pipeline for the given pull request based on specified filters
   *
   * @param pullRequest The pull request to get the pipeline for
   * @param pipelineStatus The status of the pipeline to filter by
   * @param eventType Optional event type to filter workflows by
   * @returns Promise<Pipeline | null> A standardized Pipeline object or null if not found
   */
  public override async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    const gitRepository = pullRequest.repository;

    this.logger.info(
      `Finding workflow runs for repository: ${gitRepository}, event type: ${eventType}, status: ${pipelineStatus}`
    );

    try {
      // Create a filter object for the getWorkflowRuns method
      const filter: WorkflowRunFilter = {
        event: eventType,
        per_page: 100, // Get more results to increase chances of finding relevant runs
      };

      // Map our PipelineStatus to GitHub Actions status for API filtering
      switch (pipelineStatus) {
        case PipelineStatus.RUNNING:
          filter.status = 'in_progress';
          break;
        case PipelineStatus.PENDING:
          filter.status = 'queued'; // Primary filter, we'll check for others in post-processing
          break;
        case PipelineStatus.SUCCESS:
        case PipelineStatus.FAILURE:
          // For success/failure, we want completed runs, then filter by conclusion
          filter.status = 'completed';
          break;
      }

      // If we have a SHA, include it in the filter
      if (pullRequest.sha) {
        filter.head_sha = pullRequest.sha;
      }

      // Get workflow runs using our comprehensive filter - GitHubActionsClient already has retry logic
      const response = await this.githubClient.actions.getWorkflowRuns(
        this.getRepoOwner(),
        gitRepository,
        filter
      );

      const workflowRuns = response.data?.workflow_runs || [];

      // Check if we have any workflow runs
      if (!workflowRuns || workflowRuns.length === 0) {
        this.logger.info(
          `No workflow runs found yet for repository: ${gitRepository}. Workflow may still be launching.`
        );
        return null;
      }

      this.logger.info(`Found ${workflowRuns.length} workflow runs for repository: ${gitRepository}`);

      // Filter workflow runs by the requested pipeline status
      const filteredWorkflowRuns = workflowRuns.filter(run => {
        // Skip null/undefined runs
        if (!run) return false;

        const mappedStatus = this.mapGitHubWorkflowStatusToPipelineStatus(run);
        this.logger.info(
          `Workflow run ID ${run.id}: GitHub status=${run.status}, conclusion=${run.conclusion}, mapped status=${mappedStatus}`
        );

        return mappedStatus === pipelineStatus;
      });

      // If no matching workflow runs are found, check if there are any in progress that might match later
      if (filteredWorkflowRuns.length === 0) {
        this.logger.info(`No matching workflow runs found with status: ${pipelineStatus}`);

        // Special case: For SUCCESS or FAILURE, check if there are any in-progress runs
        if (
          pipelineStatus === PipelineStatus.SUCCESS ||
          pipelineStatus === PipelineStatus.FAILURE
        ) {
          const pendingOrRunning = workflowRuns.some(
            run =>
              run.status &&
              ['queued', 'waiting', 'requested', 'pending', 'in_progress'].includes(run.status)
          );

          if (pendingOrRunning) {
            this.logger.info(
              `Found workflows still executing for repository: ${gitRepository} which may reach status ${pipelineStatus} later`
            );
          } else {
            this.logger.info(
              `All workflows are completed, but none match the requested status: ${pipelineStatus}`
            );
          }
        }

        return null;
      }

      this.logger.info(`Found ${filteredWorkflowRuns.length} matching workflow runs`);

      // Sort workflow runs by creation timestamp to get the latest one
      const sortedWorkflowRuns = [...filteredWorkflowRuns].sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA; // Descending order (latest first)
      });

      // Get the latest workflow run
      const latestRun = sortedWorkflowRuns[0];
      if (!latestRun) {
        this.logger.info('No workflow runs available after sorting');
        return null;
      }

      this.logger.info(`Using latest workflow run: ${latestRun.id} - ${latestRun.name || ''}`);

      // Create and return a standardized Pipeline object
      return this.createPipelineFromWorkflowRun(latestRun, gitRepository, pullRequest.sha);
    } catch (error) {
      this.logger.error(
        `Error getting workflow runs: ${error}`
      );
      return null;
    }
  }

  /**
   * Maps GitHub Actions workflow run status to standardized PipelineStatus
   *
   * GitHub Actions workflow statuses:
   * - 'queued': Workflow run is queued
   * - 'in_progress': Workflow run is in progress
   * - 'completed': Workflow run is completed
   * - 'waiting': The workflow run is waiting
   * - 'pending': The workflow run is pending
   * - 'requested': The workflow run is requested
   *
   * For completed workflows, we check the conclusion:
   * - 'success': The workflow run completed successfully
   * - 'failure': The workflow run failed
   * - 'cancelled': The workflow run was cancelled
   * - 'skipped': The workflow run was skipped
   * - 'timed_out': The workflow run timed out
   * - 'action_required': The workflow run requires further action
   * - 'neutral': The workflow run completed with a neutral verdict
   * - 'stale': The workflow run became stale
   *
   * @param workflowRun The GitHub Actions workflow run
   * @returns The standardized PipelineStatus
   */
  private mapGitHubWorkflowStatusToPipelineStatus(workflowRun: WorkflowRun): PipelineStatus {
    if (!workflowRun) {
      return PipelineStatus.UNKNOWN;
    }

    // Handle null or undefined values safely
    const status = workflowRun.status ? workflowRun.status.toLowerCase() : '';
    const conclusion = workflowRun.conclusion ? workflowRun.conclusion.toLowerCase() : '';

    this.logger.info(`Mapping GitHub status: ${status || 'null'}, conclusion: ${conclusion || 'none'}`);

    // First check the status
    if (status === 'completed') {
      // For completed workflows, check the conclusion
      if (conclusion === 'success') {
        return PipelineStatus.SUCCESS;
      } else if (['failure', 'timed_out', 'cancelled', 'action_required'].includes(conclusion)) {
        return PipelineStatus.FAILURE;
      } else if (conclusion === 'skipped') {
        // Skipped workflows are technically completed, but didn't run
        // Depending on requirements, you might map these to SUCCESS instead
        return PipelineStatus.UNKNOWN;
      } else if (conclusion === 'neutral') {
        // Neutral means the run completed but didn't explicitly succeed or fail
        // This is often used for informational workflows
        return PipelineStatus.SUCCESS;
      } else if (conclusion === 'stale') {
        // Stale means the run was superseded by another run
        return PipelineStatus.UNKNOWN;
      }
    } else if (status === 'in_progress') {
      return PipelineStatus.RUNNING;
    } else if (['queued', 'waiting', 'requested', 'pending'].includes(status)) {
      return PipelineStatus.PENDING;
    }

    // Default fallback
    this.logger.warn(
      `Unknown GitHub workflow status/conclusion combination: ${status || 'null'}/${conclusion || 'null'}`
    );
    return PipelineStatus.UNKNOWN;
  }

  /**
   * Create a standardized Pipeline object from a GitHub Actions workflow run
   *
   * @param workflowRun The GitHub Actions workflow run
   * @param repositoryName The name of the repository
   * @param sha The commit SHA
   * @returns A standardized Pipeline object
   */
  private createPipelineFromWorkflowRun(
    workflowRun: WorkflowRun,
    repositoryName: string,
    sha?: string
  ): Pipeline {
    if (!workflowRun) {
      throw new Error('Cannot create pipeline from undefined workflow run');
    }

    const id = workflowRun.id.toString();
    const name = workflowRun.name || `Workflow #${id}`;
    const status = this.mapGitHubWorkflowStatusToPipelineStatus(workflowRun);
    const url = workflowRun.html_url || '';

    // Format any results data - this could be further extended to extract job data if needed
    const results = workflowRun.conclusion
      ? JSON.stringify({
          conclusion: workflowRun.conclusion,
          head_branch: workflowRun.head_branch || null,
          event: workflowRun.event || 'unknown',
        })
      : '';

    return new Pipeline(
      id,
      CIType.GITHUB_ACTIONS,
      repositoryName,
      status,
      name,
      workflowRun.run_number, // Use run_number as build number
      undefined, // No job name for GitHub Actions
      url,
      '', // Logs not available yet
      results,
      workflowRun.created_at ? new Date(workflowRun.created_at) : undefined,
      workflowRun.updated_at ? new Date(workflowRun.updated_at) : undefined,
      sha || workflowRun.head_sha
    );
  }

  protected override async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    try {
      // For checking pipeline status, we need to fetch the workflow run details by repo owner and commit sha
      if (!pipeline.id || !pipeline.repositoryName) {
        throw new Error('Pipeline ID and repository name are required to check status');
      }
      const workflowRun = await this.githubClient.actions.findWorkflowRunByCommitSha(
        this.getRepoOwner(),
        pipeline.repositoryName,
        pipeline.sha || ''
      );

      if (!workflowRun) {
        this.logger.warn(`Workflow run ${pipeline.id} not found`);
        return PipelineStatus.UNKNOWN;
      }

      // Return the mapped status
      return this.mapGitHubWorkflowStatusToPipelineStatus(workflowRun);
    } catch (error) {
      this.logger.warn(
        `Workflow run ${pipeline.id} not found or inaccessible: ${error}`
      );
      return PipelineStatus.UNKNOWN;
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

    // 2. Initialize result object (mutable during construction)
    const result: MutableCancelResult = {
      total: 0,
      cancelled: 0,
      failed: 0,
      skipped: 0,
      details: [],
      errors: [],
    };

    this.logger.info(`[GitHubActions] Starting workflow cancellation for ${this.componentName}`);

    try {
      // 3. Fetch all workflow runs from GitHub API
      const allWorkflowRuns = await this.fetchAllWorkflowRuns();
      result.total = allWorkflowRuns.length;

      if (allWorkflowRuns.length === 0) {
        this.logger.info(`[GitHubActions] No workflow runs found for ${this.componentName}`);
        return result;
      }

      this.logger.info(`[GitHubActions] Found ${allWorkflowRuns.length} total workflow runs`);

      // 4. Apply filters
      const workflowRunsToCancel = this.filterWorkflowRuns(allWorkflowRuns, opts);

      this.logger.info(`[GitHubActions] ${workflowRunsToCancel.length} workflow runs match filters`);
      this.logger.info(`[GitHubActions] ${allWorkflowRuns.length - workflowRunsToCancel.length} workflow runs filtered out`);

      // 5. Cancel workflow runs in batches
      await this.cancelWorkflowRunsInBatches(workflowRunsToCancel, opts, result);

      // 6. Validate result counts (accounting invariant)
      const accounted = result.cancelled + result.failed + result.skipped;
      if (accounted !== result.total) {
        const missing = result.total - accounted;
        this.logger.error(
          `❌ [GitHubActions] ACCOUNTING ERROR: ${missing} workflow runs unaccounted for ` +
          `(total: ${result.total}, accounted: ${accounted})`
        );

        // Add accounting error to errors array
        result.errors.push({
          pipelineId: 'ACCOUNTING_ERROR',
          message: `${missing} workflow runs lost in processing`,
          error: new Error('Result count mismatch - this indicates a bug in the cancellation logic'),
        });
      }

      // 7. Log summary
      this.logger.info(`[GitHubActions] Cancellation complete:`, {
        total: result.total,
        cancelled: result.cancelled,
        failed: result.failed,
        skipped: result.skipped,
      });

    } catch (error: any) {
      this.logger.error(`[GitHubActions] Error in cancelAllPipelines: ${error.message}`);
      throw new Error(`Failed to cancel pipelines: ${error.message}`);
    }

    return result;
  }



  /**
   * Fetch all workflow runs from GitHub API (both source and gitops repos)
   */
  private async fetchAllWorkflowRuns(): Promise<WorkflowRun[]> {
    try {
      const allWorkflowRuns: WorkflowRun[] = [];

      // Fetch from source repository
      const responseSource = await this.githubClient.actions.getWorkflowRuns(
        this.getRepoOwner(),
        this.componentName,
        { per_page: 100 }
      );

      // Tag workflow runs with their repository name for later cancellation
      const taggedSourceRuns = (responseSource.data?.workflow_runs || []).map(run => ({
        ...run,
        _repositoryName: this.componentName
      }));
      allWorkflowRuns.push(...taggedSourceRuns);

      // Fetch from gitops repository
      const gitopsRepoName = `${this.componentName}-gitops`;
      try {
        const responseGitops = await this.githubClient.actions.getWorkflowRuns(
          this.getRepoOwner(),
          gitopsRepoName,
          { per_page: 100 }
        );

        // Tag workflow runs with their repository name for later cancellation
        const taggedGitopsRuns = (responseGitops.data?.workflow_runs || []).map(run => ({
          ...run,
          _repositoryName: gitopsRepoName
        }));
        allWorkflowRuns.push(...taggedGitopsRuns);
      } catch (gitopsError: any) {
        // Gitops repo might not exist, log but don't fail
        this.logger.info(`[GitHubActions] Gitops repository ${gitopsRepoName} not found or no workflows: ${gitopsError.message}`);
      }

      return allWorkflowRuns;

    } catch (error: any) {
      this.logger.error(`[GitHubActions] Failed to fetch workflow runs: ${error}`);
      throw error;
    }
  }

  /**
   * Filter workflow runs based on cancellation options
   */
  private filterWorkflowRuns(
    workflowRuns: WorkflowRun[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>
  ): WorkflowRun[] {
    return workflowRuns.filter(workflowRun => {
      // Filter 1: Skip completed workflow runs unless includeCompleted is true
      if (!options.includeCompleted && this.isCompletedStatus(workflowRun)) {
        this.logger.info(`[Filter] Skipping completed workflow run ${workflowRun.id} (${workflowRun.status}/${workflowRun.conclusion || 'none'})`);
        return false;
      }

      // Filter 2: Check exclusion patterns
      if (this.matchesExclusionPattern(workflowRun, options.excludePatterns)) {
        this.logger.info(`[Filter] Excluding workflow run ${workflowRun.id} by pattern`);
        return false;
      }

      // Filter 3: Filter by event type if specified
      if (options.eventType && !this.matchesEventType(workflowRun, options.eventType)) {
        this.logger.info(`[Filter] Skipping workflow run ${workflowRun.id} (event type mismatch)`);
        return false;
      }

      // Filter 4: Filter by branch if specified
      if (options.branch && workflowRun.head_branch !== options.branch) {
        this.logger.info(`[Filter] Skipping workflow run ${workflowRun.id} (branch mismatch)`);
        return false;
      }

      return true; // Include this workflow run for cancellation
    });
  }

  /**
   * Check if workflow run status is completed
   * GitHub has two-level status: status + conclusion
   */
  private isCompletedStatus(workflowRun: WorkflowRun): boolean {
    // A workflow is completed if status is 'completed'
    return workflowRun.status === 'completed';
  }

  /**
   * Check if workflow run matches any exclusion pattern
   */
  private matchesExclusionPattern(workflowRun: WorkflowRun, patterns: ReadonlyArray<RegExp>): boolean {
    if (patterns.length === 0) {
      return false;
    }

    const workflowName = workflowRun.name || `Workflow-${workflowRun.id}`;
    const branch = workflowRun.head_branch || '';

    return patterns.some(pattern =>
      pattern.test(workflowName) || pattern.test(branch)
    );
  }

  /**
   * Check if workflow run matches the event type
   */
  private matchesEventType(workflowRun: WorkflowRun, eventType: EventType): boolean {
    // GitHub uses 'event' field to indicate trigger type
    switch (eventType) {
      case EventType.PUSH:
        return workflowRun.event === 'push';
      case EventType.PULL_REQUEST:
        return workflowRun.event === 'pull_request';
      default:
        return false;
    }
  }

  /**
   * Cancel workflow runs in batches with concurrency control
   */
  private async cancelWorkflowRunsInBatches(
    workflowRuns: WorkflowRun[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Split into batches
    const batches = this.chunkArray(workflowRuns, options.concurrency);

    this.logger.info(`[GitHubActions] Processing ${batches.length} batches with concurrency ${options.concurrency}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`[GitHubActions] Processing batch ${i + 1}/${batches.length} (${batch.length} workflow runs)`);

      // Create promises for all workflow runs in this batch
      const promises = batch.map(workflowRun =>
        this.cancelSingleWorkflowRun(workflowRun, options, result)
      );

      // Wait for all in batch to complete (don't stop on errors)
      const batchResults = await Promise.allSettled(promises);

      // Inspect batch results for systemic failures
      const batchSuccesses = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailures = batchResults.filter(r => r.status === 'rejected').length;

      this.logger.info(`[GitHubActions] Batch ${i + 1}/${batches.length} complete: ${batchSuccesses} succeeded, ${batchFailures} rejected`);

      // Alert on complete batch failure - indicates systemic issue
      if (batchFailures === batch.length && batch.length > 0) {
        this.logger.error(`❌ [GitHubActions] ENTIRE BATCH ${i + 1} FAILED - possible systemic issue (auth, network, or API problem)`);

        // Log first rejection reason for debugging
        const firstRejected = batchResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstRejected) {
          this.logger.error(`[GitHubActions] First failure reason: ${firstRejected.reason}`);
        }
      }
    }
  }

  /**
   * Cancel a single workflow run and update results
   */
  private async cancelSingleWorkflowRun(
    workflowRun: WorkflowRun,
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Initialize detail object (mutable during construction)
    const detail: MutablePipelineCancelDetail = {
      pipelineId: workflowRun.id,
      name: workflowRun.name || `Workflow-${workflowRun.id}`,
      status: this.mapGitHubWorkflowStatusToPipelineStatus(workflowRun),
      result: 'skipped',
      branch: workflowRun.head_branch || undefined,
      eventType: this.mapGitHubEventType(workflowRun),
    };

    try {
      if (options.dryRun) {
        // Dry run mode - don't actually cancel
        detail.result = 'skipped';
        detail.reason = 'Dry run mode';
        result.skipped++;
        this.logger.info(`[DryRun] Would cancel workflow run ${workflowRun.id}`);

      } else {
        // Extract repository name from tagged workflow run (added in fetchAllWorkflowRuns)
        const repositoryName = (workflowRun as any)._repositoryName || this.componentName;

        // Actually cancel the workflow run via GitHub API
        await this.cancelWorkflowRunViaAPI(workflowRun.id, repositoryName);

        detail.result = 'cancelled';
        result.cancelled++;
        this.logger.info(`✅ [GitHubActions] Cancelled workflow run ${workflowRun.id} in ${repositoryName} (status: ${workflowRun.status})`);
      }

    } catch (error: any) {
      // Cancellation failed
      detail.result = 'failed';
      detail.reason = error.message;
      result.failed++;

      // Add to errors array (mutable during construction)
      const cancelError: MutableCancelError = {
        pipelineId: workflowRun.id,
        message: error.message,
        error: error,
      };

      // Add status code if available
      if (error.response?.status) {
        cancelError.statusCode = error.response.status;
      }

      // Add provider error code if available
      if (error.response?.data?.message) {
        cancelError.providerErrorCode = error.response.data.message;
      }

      result.errors.push(cancelError);

      this.logger.error(`❌ [GitHubActions] Failed to cancel workflow run ${workflowRun.id}: ${error}`);
    }

    // Add detail to results
    result.details.push(detail);
  }

  /**
   * Actually cancel the workflow run via GitHub API
   */
  private async cancelWorkflowRunViaAPI(workflowRunId: number, repositoryName: string): Promise<void> {
    try {
      await this.githubClient.actions.cancelWorkflowRun(
        this.getRepoOwner(),
        repositoryName,
        workflowRunId
      );

    } catch (error: any) {
      // Handle GitHub-specific errors
      if (error.response?.status === 404) {
        throw new Error('Workflow run not found (may have been deleted)');
      }
      if (error.response?.status === 403) {
        throw new Error('Insufficient permissions to cancel workflow run');
      }
      if (error.response?.status === 409) {
        throw new Error('Workflow run cannot be cancelled (already completed or not cancellable)');
      }
      if (error.response?.data?.message) {
        throw new Error(`GitHub API error: ${error.response.data.message}`);
      }

      throw error;
    }
  }

  /**
   * Map GitHub workflow run to EventType
   */
  private mapGitHubEventType(workflowRun: WorkflowRun): EventType | undefined {
    if (workflowRun.event === 'push') {
      return EventType.PUSH;
    }
    if (workflowRun.event === 'pull_request') {
      return EventType.PULL_REQUEST;
    }
    return undefined;
  }



  public override async waitForAllPipelineRunsToFinish(
    timeoutMs = 5 * 60 * 1000,
    pollIntervalMs = 5000
  ): Promise<void> {
    this.logger.info(`Waiting for all workflow runs to finish for component: ${this.componentName}`);
    const sourceRepoName = this.componentName;
    const startTime = Date.now();

    while (true) {
      const response = await this.githubClient.actions.getWorkflowRuns(
        this.getRepoOwner(),
        sourceRepoName,
        { per_page: 100 }
      );
      const workflowRuns = response.data?.workflow_runs || [];

      if (!workflowRuns.length) {
        this.logger.info(`No workflow runs found for repository: ${sourceRepoName}`);
        return;
      }

      const runningWorkflowRuns = workflowRuns.filter(run =>
        ['in_progress', 'queued', 'waiting', 'requested', 'pending'].includes(run.status || '')
      );

      if (runningWorkflowRuns.length === 0) {
        this.logger.info('All workflows have finished processing.');
        return;
      }

      this.logger.info(
        `Found ${runningWorkflowRuns.length} running workflow run(s) for ${sourceRepoName}. Waiting...`
      );

      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout: Some workflow runs did not finish within ${timeoutMs / 1000}s`);
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  public override async getWebhookUrl(): Promise<string> {
    throw new Error(
      'GitHub Actions does not support webhooks in the same way as other CI systems.'
    );
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return '.github/workflows';
  }

  public override async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    try {
      this.logger.info(
        `Fetching comprehensive logs for pipeline ${pipeline.id} (${pipeline.name || 'unnamed'})`
      );

      // Use the comprehensive log retrieval method from GitHubActionsClient
      const logs = await this.githubClient.actions.getWorkflowRunLogs(
        this.getRepoOwner(),
        pipeline.repositoryName,
        parseInt(pipeline.id)
      );

      return logs;
    } catch (error) {
      this.logger.error(`Error getting comprehensive workflow logs for ${pipeline.id}: ${error}`);

      // Fallback to basic job summary if comprehensive logs fail
      try {
        this.logger.info(`Falling back to basic job summary for pipeline ${pipeline.id}`);

        const jobsResponse = await this.githubClient.actions.listJobsForWorkflowRun(
          this.getRepoOwner(),
          pipeline.repositoryName,
          parseInt(pipeline.id)
        );

        const jobs = Array.isArray(jobsResponse.data?.jobs) ? jobsResponse.data.jobs : [];

        if (jobs.length === 0) {
          return `No jobs found for workflow run ${pipeline.id}\n\nView workflow at: ${pipeline.url}`;
        }

        // Build a basic summary of jobs
        let logSummary = `=== GitHub Actions Workflow Logs ===\n`;
        logSummary += `Workflow: ${pipeline.name || pipeline.id}\n`;
        logSummary += `Repository: ${pipeline.repositoryName}\n`;
        logSummary += `Status: ${pipeline.status}\n`;
        logSummary += `URL: ${pipeline.url}\n\n`;

        logSummary += `Jobs in this workflow (${jobs.length}):\n`;
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          if (job && job.name) {
            logSummary += `\n${i + 1}. Job: ${job.name}\n`;
            logSummary += `   ID: ${job.id || 'unknown'}\n`;
            logSummary += `   Status: ${job.status || 'unknown'}\n`;
            logSummary += `   Conclusion: ${job.conclusion || 'in progress'}\n`;

            if (job.started_at) {
              logSummary += `   Started: ${job.started_at}\n`;
            }
            if (job.completed_at) {
              logSummary += `   Completed: ${job.completed_at}\n`;
            }
            if (job.html_url) {
              logSummary += `   Job URL: ${job.html_url}\n`;
            }
          }
        }

        logSummary += `\n${'='.repeat(50)}\n`;
        logSummary += `\nNote: This is a basic summary. For detailed logs:\n`;
        logSummary += `1. Visit the workflow URL above\n`;
        logSummary += `2. Click on individual job names to see step-by-step logs\n`;
        logSummary += `3. Use GitHub CLI: gh run view ${pipeline.id} --log\n`;

        return logSummary;
      } catch (fallbackError) {
        const errorMessage = `Failed to get pipeline logs for workflow ${pipeline.id}`;
        this.logger.error(`${errorMessage}: ${fallbackError}`);

        return `${errorMessage}\n\nPrimary error: ${error}\nFallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}\n\nPlease visit the workflow URL to view logs: ${pipeline.url}`;
      }
    }
  }
}

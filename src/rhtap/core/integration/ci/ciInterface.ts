import { IntegrationSecret } from '../../integrationSecret';
import { PullRequest } from '../git/models';
import { Pipeline, PipelineStatus } from './pipeline';

export enum CIType {
  TEKTON = 'tekton',
  GITHUB_ACTIONS = 'githubactions',
  GITLABCI = 'gitlabci',
  JENKINS = 'jenkins',
  AZURE = 'azure',
}

// event types
//TODO: it matches the value of annotation "pipelinesascode.tekton.dev/on-event" in pipelinerun.
// why don't use label "pipelinesascode.tekton.dev/event-type" in pipelinerun? this is because Gitlab is using Merge_Request, github is using pull_request. we need unified event type to manage them.
// Jenkins, GitHub Actions, and GitLab CI may have different event types?
export enum EventType {
  PULL_REQUEST = 'pull_request',
  PUSH = 'push',
  // Add Jenkins-specific event types if needed
  COMMIT = 'commit',
  BUILD = 'build',
  // MERGE_REQUEST="Merge_Request"
}

/**
 * Options for configuring pipeline cancellation behavior
 */
export interface CancelPipelineOptions {
  /**
   * Regular expression patterns to exclude pipelines from cancellation
   * Matches against pipeline name, ID, or branch name (provider-specific)
   * @example [/^prod-/, /^release\//] - excludes production and release pipelines
   */
  excludePatterns?: RegExp[];

  /**
   * Whether to cancel pipelines in all states or only active ones
   * @default false (only cancel running/pending pipelines)
   */
  includeCompleted?: boolean;

  /**
   * Optional event type filter (PULL_REQUEST, PUSH, etc.)
   * If specified, only pipelines matching this event type will be cancelled
   */
  eventType?: EventType;

  /**
   * Optional branch filter
   * If specified, only pipelines for this branch will be cancelled
   */
  branch?: string;

  /**
   * Maximum number of pipelines to cancel in parallel
   * @default 10
   */
  concurrency?: number;

  /**
   * Dry run mode - don't actually cancel, just return what would be cancelled
   * @default false
   */
  dryRun?: boolean;
}

/**
 * Result of pipeline cancellation operation
 */
export interface CancelResult {
  /**
   * Total number of pipelines found
   */
  total: number;

  /**
   * Number of pipelines successfully cancelled
   */
  cancelled: number;

  /**
   * Number of pipelines that failed to cancel
   */
  failed: number;

  /**
   * Number of pipelines skipped (due to filters or already completed)
   */
  skipped: number;

  /**
   * Detailed information about each pipeline operation
   */
  details: PipelineCancelDetail[];

  /**
   * Any errors encountered during cancellation
   */
  errors: CancelError[];
}

/**
 * Details about individual pipeline cancellation attempt
 */
export interface PipelineCancelDetail {
  /**
   * Pipeline identifier (provider-specific)
   */
  pipelineId: string | number;

  /**
   * Pipeline name or display name
   */
  name: string;

  /**
   * Pipeline status before cancellation attempt
   */
  status: PipelineStatus;

  /**
   * Operation result
   */
  result: 'cancelled' | 'failed' | 'skipped';

  /**
   * Reason for skip or failure
   */
  reason?: string;

  /**
   * Branch name (if available)
   */
  branch?: string;

  /**
   * Event type (if available)
   */
  eventType?: EventType;
}

/**
 * Error information for failed cancellations
 */
export interface CancelError {
  /**
   * Pipeline identifier that failed
   */
  pipelineId: string | number;

  /**
   * Error message
   */
  message: string;

  /**
   * Original error object (if available)
   */
  error?: Error;

  /**
   * HTTP status code (if applicable)
   */
  statusCode?: number;

  /**
   * Provider-specific error code
   */
  providerErrorCode?: string;
}

export interface CI extends IntegrationSecret {
  //TODO: it should wait for all pipeines to finish triggered from both source and gitops repos
  waitForAllPipelineRunsToFinish(): Promise<void>;
  getCIType(): CIType;

  /**
   * Get a pipeline for the given pull request
   * @param pullRequest The pull request to get the pipeline for
   * @param eventType Optional event type - some CI systems like Tekton use this to filter pipelines,
   *                  while others like Jenkins may ignore it
   * @param pipelineStatus The status of the pipeline to filter by
   */
  getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null>;
  waitForPipelineToFinish(pipeline: Pipeline): Promise<PipelineStatus>;
  getPipelineStatus(): Promise<PipelineStatus>;
  getPipelineLogs(pipeline: Pipeline): Promise<string>;
  getPipelineResults(): Promise<string>;

  getWebhookUrl(): Promise<string>;
  getCIFilePathInRepo(): Promise<string>;

  /**
   * Cancel all pipelines for this component with optional filtering
   *
   * This method cancels all active pipelines (running/pending by default).
   * Completed pipelines (success/failed/cancelled) are skipped unless
   * includeCompleted option is set to true.
   *
   * @param options Optional configuration for filtering and behavior
   * @returns Promise resolving to detailed cancellation results
   *
   * @example
   * // Cancel all active pipelines
   * const result = await ci.cancelAllPipelines();
   *
   * @example
   * // Cancel all pipelines except production ones
   * const result = await ci.cancelAllPipelines({
   *   excludePatterns: [/^prod-/, /^release\//]
   * });
   *
   * @example
   * // Dry run to see what would be cancelled
   * const result = await ci.cancelAllPipelines({ dryRun: true });
   * console.log(`Would cancel ${result.cancelled} pipelines`);
   */
  cancelAllPipelines(options?: CancelPipelineOptions): Promise<CancelResult>;
}
export { PipelineStatus, Pipeline };

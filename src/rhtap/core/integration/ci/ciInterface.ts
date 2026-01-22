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
  readonly excludePatterns?: ReadonlyArray<RegExp>;

  /**
   * Whether to cancel pipelines in all states or only active ones
   * @default false (only cancel running/pending pipelines)
   */
  readonly includeCompleted?: boolean;

  /**
   * Optional event type filter (PULL_REQUEST, PUSH, etc.)
   * If specified, only pipelines matching this event type will be cancelled
   */
  readonly eventType?: EventType;

  /**
   * Optional branch filter
   * If specified, only pipelines for this branch will be cancelled
   */
  readonly branch?: string;

  /**
   * Maximum number of pipelines to cancel in parallel
   * @default 10
   */
  readonly concurrency?: number;

  /**
   * Dry run mode - don't actually cancel, just return what would be cancelled
   * @default false
   */
  readonly dryRun?: boolean;
}

/**
 * Internal mutable version of PipelineCancelDetail for construction
 * @internal - Use only within CI provider implementations
 */
export interface MutablePipelineCancelDetail {
  pipelineId: string | number;
  name: string;
  status: PipelineStatus;
  result: 'cancelled' | 'failed' | 'skipped';
  reason?: string;
  branch?: string;
  eventType?: EventType;
}

/**
 * Internal mutable version of CancelError for construction
 * @internal - Use only within CI provider implementations
 */
export interface MutableCancelError {
  pipelineId: string | number;
  message: string;
  error?: Error;
  statusCode?: number;
  providerErrorCode?: string;
}

/**
 * Internal mutable version of CancelResult for construction
 * @internal - Use only within CI provider implementations during result building
 *
 * @example
 * ```typescript
 * const result: MutableCancelResult = { total: 0, cancelled: 0, ... };
 * result.total = workflows.length;  // ✅ OK during construction
 * result.errors.push(error);         // ✅ OK during construction
 * return result;                     // Implicitly cast to readonly CancelResult
 * ```
 */
export interface MutableCancelResult {
  total: number;
  cancelled: number;
  failed: number;
  skipped: number;
  details: MutablePipelineCancelDetail[];
  errors: MutableCancelError[];
}

/**
 * Result of pipeline cancellation operation
 *
 * @remarks
 * This type is immutable. Once created, properties cannot be modified.
 * Arrays are readonly to prevent accidental mutations.
 *
 * @example
 * ```typescript
 * const result = await ci.cancelAllPipelines();
 * console.log(result.total); // ✅ OK - reading is allowed
 * // result.total = 999; // ❌ Compile error - cannot modify
 * // result.errors.push({...}); // ❌ Compile error - cannot mutate arrays
 * ```
 */
export interface CancelResult {
  /**
   * Total number of pipelines found
   */
  readonly total: number;

  /**
   * Number of pipelines successfully cancelled
   */
  readonly cancelled: number;

  /**
   * Number of pipelines that failed to cancel
   */
  readonly failed: number;

  /**
   * Number of pipelines skipped (due to filters or already completed)
   */
  readonly skipped: number;

  /**
   * Detailed information about each pipeline operation
   */
  readonly details: ReadonlyArray<Readonly<PipelineCancelDetail>>;

  /**
   * Any errors encountered during cancellation
   */
  readonly errors: ReadonlyArray<Readonly<CancelError>>;
}

/**
 * Details about individual pipeline cancellation attempt
 *
 * @remarks
 * This type is immutable to ensure data integrity when used in CancelResult.
 */
export interface PipelineCancelDetail {
  /**
   * Pipeline identifier (provider-specific)
   */
  readonly pipelineId: string | number;

  /**
   * Pipeline name or display name
   */
  readonly name: string;

  /**
   * Pipeline status before cancellation attempt
   */
  readonly status: PipelineStatus;

  /**
   * Operation result
   */
  readonly result: 'cancelled' | 'failed' | 'skipped';

  /**
   * Reason for skip or failure
   */
  readonly reason?: string;

  /**
   * Branch name (if available)
   */
  readonly branch?: string;

  /**
   * Event type (if available)
   */
  readonly eventType?: EventType;
}

/**
 * Error information for failed cancellations
 *
 * @remarks
 * This type is immutable to ensure error data cannot be modified after creation.
 */
export interface CancelError {
  /**
   * Pipeline identifier that failed
   */
  readonly pipelineId: string | number;

  /**
   * Error message
   */
  readonly message: string;

  /**
   * Original error object (if available)
   */
  readonly error?: Error;

  /**
   * HTTP status code (if applicable)
   */
  readonly statusCode?: number;

  /**
   * Provider-specific error code
   */
  readonly providerErrorCode?: string;
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

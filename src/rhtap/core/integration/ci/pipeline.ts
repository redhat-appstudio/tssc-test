import { CIType } from './ciInterface';

/**
 * Standardized pipeline status enum used across all CI providers
 */
export enum PipelineStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  RUNNING = 'running',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

/**
 * Enhanced Pipeline class that can represent different CI pipeline types (Tekton, Jenkins, etc.)
 */
export class Pipeline {
  constructor(
    // // Common properties for all pipeline types
    public readonly id: string, // Unique identifier for the pipeline
    public readonly ciType: CIType, // The CI system this pipeline belongs to
    public readonly repositoryName: string, // Name of the repository that this pipeline is associated with

    // Status information
    public status: PipelineStatus, // Current status of the pipeline (running, success, failed, etc.)

    // Optional properties that may be CI-specific
    public name?: string, // Pipeline name
    public buildNumber?: number, // Build number (used in Jenkins)
    public jobName?: string, // Job name (used in Jenkins)
    public url?: string, // URL to view the pipeline in the CI system
    public logs?: string, // Pipeline execution logs
    public results?: string, // Pipeline results as JSON or other format
    public startTime?: Date, // When the pipeline started
    public endTime?: Date, // When the pipeline finished
    public sha?: string // Git commit SHA that triggered the pipeline
  ) {}

  /**
   * Gets a unique identifier for the pipeline that works across different CI systems
   */
  public getIdentifier(): string {
    return this.id;
  }

  /**
   * Get a display name for the pipeline appropriate for the CI type
   */
  public getDisplayName(): string {
    switch (this.ciType) {
      case CIType.JENKINS:
        return this.jobName ? `${this.jobName} #${this.buildNumber}` : this.id;
      case CIType.TEKTON:
        return this.name || this.id;
      default:
        return this.name || this.id;
    }
  }

  /**
   * Check if the pipeline has completed (regardless of success or failure)
   */
  public isCompleted(): boolean {
    return this.status === PipelineStatus.SUCCESS || this.status === PipelineStatus.FAILURE;
  }

  /**
   * Check if the pipeline completed successfully
   */
  public isSuccessful(): boolean {
    return this.status === PipelineStatus.SUCCESS;
  }

  /**
   * Update the status of this pipeline
   */
  public updateStatus(status: PipelineStatus): void {
    this.status = status;
  }

  /**
   * Factory method to create a Tekton pipeline
   */
  public static createTektonPipeline(
    name: string,
    status: PipelineStatus,
    repositoryName: string,
    logs: string = '',
    results: string = '',
    url?: string,
    sha?: string
  ): Pipeline {
    return new Pipeline(
      name, // Use name as ID for Tekton
      CIType.TEKTON,
      repositoryName,
      status,
      name,
      undefined, // No build number for Tekton
      undefined, // No job name for Tekton
      url,
      logs,
      results,
      undefined, // Start time not provided
      undefined, // End time not provided
      sha
    );
  }

  /**
   * Factory method to create a Jenkins pipeline
   */
  public static createJenkinsPipeline(
    jobName: string,
    buildNumber: number,
    status: PipelineStatus,
    repositoryName: string,
    logs: string = '',
    results: string = '',
    url?: string,
    sha?: string
  ): Pipeline {
    // For Jenkins, create an ID that combines job name and build number
    const id = `${jobName}-${buildNumber}`;

    return new Pipeline(
      id,
      CIType.JENKINS,
      repositoryName,
      status,
      undefined, // No name for Jenkins
      buildNumber,
      jobName,
      url,
      logs,
      results,
      undefined, // Start time not provided
      undefined, // End time not provided
      sha
    );
  }

  /**
   * Factory method to create a GitLab CI pipeline
   */
  public static createGitLabPipeline(
    pipelineId: number,
    status: PipelineStatus,
    repositoryName: string,
    logs: string = '',
    results: string = '',
    url?: string,
    sha?: string
  ): Pipeline {
    // For GitLab, use pipeline ID as the unique identifier
    const id = pipelineId.toString();

    return new Pipeline(
      id,
      CIType.GITLABCI,
      repositoryName,
      status,
      `Pipeline #${pipelineId}`, // Name for GitLab pipeline
      pipelineId, // Use pipeline ID as build number
      undefined, // No job name for GitLab
      url,
      logs,
      results,
      undefined, // Start time not provided
      undefined, // End time not provided
      sha
    );
  }
}

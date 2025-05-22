import { GitLabClient, GitLabClientOptions } from "../git/gitlabClient";
import { PipelineStatus } from "../../rhtap/core/integration/ci/ciInterface";
import retry from 'async-retry';

// Define GitLab pipeline statuses and their mapping to our standardized statuses
const GITLAB_STATUS_MAPPING: Record<string, PipelineStatus> = {
  'success': PipelineStatus.SUCCESS,
  'failed': PipelineStatus.FAILURE,
  'running': PipelineStatus.RUNNING,
  'pending': PipelineStatus.PENDING,
  'created': PipelineStatus.PENDING,
  'canceled': PipelineStatus.FAILURE,
  'skipped': PipelineStatus.FAILURE, // Changed from UNKNOWN to FAILURE to mark it as completed
  'manual': PipelineStatus.PENDING,
  'scheduled': PipelineStatus.PENDING,
  'waiting_for_resource': PipelineStatus.PENDING,
  'preparing': PipelineStatus.PENDING
};

// Interface to represent GitLab pipeline data
export interface GitLabPipeline {
  id: number;
  sha: string;
  source: string;
  ref: string;
  status: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  project_id: number;
}

export class GitLabCIClient{
  private gitlabClient: GitLabClient;

  /**
   * Create a new GitLab client
   * @param baseUrl The base URL of the GitLab instance
   * @param token Personal access token for authentication
   */
  constructor(options: GitLabClientOptions) {
    this.gitlabClient = new GitLabClient({
      baseUrl: options.baseUrl || 'https://gitlab.com',
      token: options.token,
    });
  }

  public getGitlabClient(): GitLabClient {
    return this.gitlabClient;
  }

  /**
   * Gets pipelines for a specific repository and commit SHA with retry functionality
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @param sha Optional commit SHA for which to get pipelines
   * @param status Optional status filter for pipelines
   * @returns A promise that resolves to an array of GitLab pipelines
   */
  public async getPipelines(
    projectPath: string,
    sha?: string,
    status?: string
  ): Promise<GitLabPipeline[]> {
    const params: Record<string, any> = {};

    // Condition 1: If sha is provided (regardless of status), get all pipelines for that SHA
    if (sha) {
      params.sha = sha;
    }
    // Condition 2: If status is provided, add it as a filter
    if (status) {
      params.status = status;
    }
    try {
      return await retry(async (_, attempt) => {
        try {
          const pipelines = await this.gitlabClient.getClient().Pipelines.all(projectPath, params) || [];
          
          // If we got an empty array and we still have retries left, throw an error to trigger retry
          if (pipelines.length === 0) {
            console.log(`Got empty pipelines array on attempt ${attempt}, will retry if attempts remain`);
            throw new Error('Empty pipelines array received');
          }
          
          return pipelines as GitLabPipeline[];
        } catch (error) {
          // Throw error to trigger retry mechanism
          throw error;
        }
      }, {
        retries: 5, // Retry 5 times
        minTimeout: 5000, // Start with a 5 second delay
        maxTimeout: 15000, // Maximum timeout between retries
        onRetry: (error: Error, attempt: number) => {
          console.log(`[GITLAB-RETRY ${attempt}/5] 🔄 Project: ${projectPath} | Status: Failed | Reason: ${error.message}`);
        }
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to get GitLab pipelines for project ${projectPath} after multiple retries: ${errorMessage}`);
      // Return empty array instead of throwing to make error handling easier for callers
      return [];
    }
  }

  /**
   * Gets all pipelines for a project
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @returns A promise that resolves to an array of GitLab pipelines
   */
  public async getAllPipelines(projectPath: string): Promise<GitLabPipeline[]> {
    return this.getPipelines(projectPath);
  }
  /**
   * Gets a specific pipeline by ID
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @param pipelineId The ID of the pipeline to retrieve
   * @returns A promise that resolves to a GitLab pipeline
   */
  public async getPipelineById(
    projectPath: string,
    pipelineId: number
  ): Promise<GitLabPipeline> {
    try {
      const pipeline = await this.gitlabClient.getClient().Pipelines.show(projectPath, pipelineId);
      return pipeline as GitLabPipeline;
    } catch (error) {
      console.error(`Failed to get GitLab pipeline ${pipelineId} for project ${projectPath}:`, error);
      throw error;
    }
  }

  /**
   * Gets the logs for a specific pipeline job
   * @param projectPath The project path in GitLab
   * @param jobId The job ID for which to retrieve logs
   * @returns A promise that resolves to the job logs as a string
   */
  // public async getPipelineLogs(projectPath: string, jobId: number): Promise<string> {
  //   try {
  //     // Access the raw REST API client to make a direct request for job logs
  //     const gitlab = this.gitlabClient.getClient();
      
  //     // GitLab API endpoint for job traces is GET /projects/:id/jobs/:job_id/trace
  //     const encodedProjectPath = encodeURIComponent(projectPath);
  //     const url = `projects/${encodedProjectPath}/jobs/${jobId}/trace`;
      
  //     // Make the request using the underlying requester
  //     const jobTrace = await gitlab.request.get(url);
  //     return jobTrace as string;
  //   } catch (error) {
  //     console.error(`Failed to get logs for job ${jobId} in project ${projectPath}:`, error);
  //     return 'Failed to retrieve job logs';
  //   }
  // }

  /**
   * Maps GitLab pipeline status to our standardized PipelineStatus enum
   * @param gitlabStatus The status string from GitLab API
   * @returns The standardized PipelineStatus value
   */
  public mapPipelineStatus(gitlabStatus: string): PipelineStatus {
    return GITLAB_STATUS_MAPPING[gitlabStatus.toLowerCase()] || PipelineStatus.UNKNOWN;
  }
}
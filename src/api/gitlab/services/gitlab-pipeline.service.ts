import { Gitlab } from '@gitbeaker/rest';
import retry from 'async-retry';
import { IGitLabPipelineService } from '../interfaces/gitlab.interfaces';
import {
  GitLabPipeline,
  GitLabPipelineSearchParams,
} from '../types/gitlab.types';
import { PipelineStatus } from '../../../rhtap/core/integration/ci/pipeline';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';
import { GitLabUtils } from '../utils/gitlab.utils';

export class GitLabPipelineService implements IGitLabPipelineService {
  constructor(private readonly gitlabClient: InstanceType<typeof Gitlab>) {}

  public async getPipelines(
    projectPath: string,
    params: GitLabPipelineSearchParams = {}
  ): Promise<GitLabPipeline[]> {
    try {
      return await retry(
        async (_, attempt) => {
          try {
            const pipelines =
              (await this.gitlabClient.Pipelines.all(projectPath, params as any)) || [];

            // If we got an empty array and we still have retries left, throw an error to trigger retry
            if (pipelines.length === 0) {
              console.log(
                `Got empty pipelines array on attempt ${attempt}, will retry if attempts remain`
              );
              throw new Error('Empty pipelines array received');
            }

            return pipelines as GitLabPipeline[];
          } catch (error) {
            // Throw error to trigger retry mechanism
            throw error;
          }
        },
        {
          retries: 5,
          minTimeout: 5000,
          maxTimeout: 15000,
          onRetry: (error: Error, attempt: number) => {
            console.log(
              `[GITLAB-RETRY ${attempt}/5] 🔄 Project: ${projectPath} | Status: Failed | Reason: ${error.message}`
            );
          },
        }
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to get GitLab pipelines for project ${projectPath} after multiple retries: ${errorMessage}`
      );
      // Return empty array instead of throwing to make error handling easier for callers
      return [];
    }
  }

  public async getAllPipelines(projectPath: string): Promise<GitLabPipeline[]> {
    return this.getPipelines(projectPath);
  }

  public async getPipelineById(projectPath: string, pipelineId: number): Promise<GitLabPipeline> {
    try {
      const pipeline = await this.gitlabClient.Pipelines.show(projectPath, pipelineId);
      return pipeline as GitLabPipeline;
    } catch (error) {
      console.error(
        `Failed to get GitLab pipeline ${pipelineId} for project ${projectPath}:`,
        error
      );
      throw createGitLabErrorFromResponse(
        'getPipelineById',
        error,
        'pipeline',
        pipelineId
      );
    }
  }

  public async getPipelineLogs(projectPath: string, jobId: number): Promise<string> {
    try {
      // GitLab API endpoint for job traces is GET /projects/:id/jobs/:job_id/trace
      const encodedProjectPath = encodeURIComponent(projectPath);
      const url = `projects/${encodedProjectPath}/jobs/${jobId}/trace`;

      // Make the request using the underlying requester
      const jobTrace = await this.gitlabClient.requester.get(url);
      return jobTrace as unknown as string;
    } catch (error) {
      console.error(`Failed to get logs for job ${jobId} in project ${projectPath}:`, error);
      return 'Failed to retrieve job logs';
    }
  }

  public mapPipelineStatus(gitlabStatus: string): PipelineStatus {
    return GitLabUtils.mapPipelineStatus(gitlabStatus);
  }
} 
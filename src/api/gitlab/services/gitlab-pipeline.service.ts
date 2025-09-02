import { Gitlab, JobSchema } from '@gitbeaker/rest';
import retry from 'async-retry';
import { IGitLabPipelineService } from '../interfaces/gitlab.interfaces';
import {
  GitLabPipeline,
  GitLabPipelineSearchParams,
} from '../types/gitlab.types';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';

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

  public async getPipelineJobsInfo(projectPath: string, pipelineId: number): Promise<JobSchema[]> {
    try {
      // GitLab API endpoint for listing jobs in a pipeline
      const jobs = await this.gitlabClient.Jobs.all(projectPath, { pipelineId });
      return jobs as JobSchema[];
    } catch (error) {
      console.error(`Failed to get jobs for pipeline ${pipelineId} in project ${projectPath}:`, error);
      throw error;
    }
  }

  public async getJobLogs(projectPath: string, jobId: number, jobName: string): Promise<string> {
    try {
      const log = `\n--- Job: #${jobId} ${jobName} ---\n`;
      // Use the requester to get job trace directly
      const encodedProjectPath = encodeURIComponent(projectPath);
      const traceUrl = `projects/${encodedProjectPath}/jobs/${jobId}/trace`;
      const jobTrace = await this.gitlabClient.requester.get(traceUrl);

      return `${log} ${String(jobTrace.body)}`;
    } catch (error) {
      console.error(`Error while getting job logs for Job ${jobId}: ${error}`);
      throw error;
    }
  }

  public async getPipelineLogs(projectPath: string, pipelineId: number): Promise<string> {
    try {
      const allJobs = await this.getPipelineJobsInfo(projectPath, pipelineId);
      let pipelineLogs: string = '';

      await Promise.all(
        allJobs.map(async (job: JobSchema) => {
            const jobLogs = await this.getJobLogs(projectPath, job.id, job.name);
            pipelineLogs += jobLogs;
        })
      );
      return pipelineLogs;
    } catch (error) {
      console.error(`Failed to get logs for pipeline ${pipelineId} in project ${projectPath}:`, error);
      return 'Failed to retrieve job logs';
    }
  }

  public async cancelPipeline(projectPath: string, pipelineId: number): Promise<GitLabPipeline> {
    try {
      const cancelledPipeline = await this.gitlabClient.Pipelines.cancel(projectPath, pipelineId);
      console.log(`Cancelled pipeline ${pipelineId} for project ${projectPath}`);
      return cancelledPipeline as GitLabPipeline;
    } catch (error) {
      console.error(
        `Failed to cancel GitLab pipeline ${pipelineId} for project ${projectPath}:`,
        error
      );
      throw createGitLabErrorFromResponse(
        'cancelPipeline',
        error,
        'pipeline',
        pipelineId
      );
    }
  }
} 
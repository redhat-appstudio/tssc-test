import { Gitlab } from '@gitbeaker/rest';
import retry from 'async-retry';
import { IGitLabPipelineService } from '../interfaces/gitlab.interfaces';
import {
  GitLabPipeline,
  GitLabPipelineSearchParams,
  GitLabJob
} from '../types/gitlab.types';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class GitLabPipelineService implements IGitLabPipelineService {
  private readonly logger: Logger;

  constructor(private readonly gitlabClient: InstanceType<typeof Gitlab>) {
    this.logger = LoggerFactory.getLogger('gitlab.pipeline');
  }

  public async getPipelines(
    projectPath: string,
    params: GitLabPipelineSearchParams = {}
  ): Promise<GitLabPipeline[]> {
    try {
      const pipelines =
        (await this.gitlabClient.Pipelines.all(projectPath, params as any)) || [];

      this.logger.info(`Found ${pipelines.length} GitLab pipelines for project: ${projectPath}`);
      
      return pipelines as GitLabPipeline[];
    } catch (error: unknown) {
      const errorMessage = error;
      this.logger.error(
        `Failed to get GitLab pipelines for project ${projectPath}: ${errorMessage}`
      );
      throw new Error(`Failed to get GitLab pipelines for project ${projectPath}: ${errorMessage}`);
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
      this.logger.error(
        `Failed to get GitLab pipeline ${pipelineId} for project ${projectPath}: ${error}`
      );
      throw createGitLabErrorFromResponse(
        'getPipelineById',
        error,
        'pipeline',
        pipelineId
      );
    }
  }

  public async getPipelineJobsInfo(projectPath: string, pipelineId: number): Promise<GitLabJob[]> {
    try {
      const jobsInfo = await this.gitlabClient.Jobs.all(projectPath, { pipelineId });
      
      this.logger.info(`Found ${jobsInfo?.length || 0} jobs for pipeline ${pipelineId} in project: ${projectPath}`);
      
      return (jobsInfo as GitLabJob[]) || [];
    } catch (error) {
      this.logger.error(`Failed to get jobs for pipeline ${pipelineId} in project ${projectPath}: ${error}`);
      throw error;
    }
  }

  public async getJobLogs(projectPath: string, jobId: number, jobName: string): Promise<string> {
    const log = `--- Job: #${jobId} ${jobName} ---`;
    try {
      return await retry(
        async (_, attempt) => {
          try {
            // Use the requester to get job trace directly
            const encodedProjectPath = encodeURIComponent(projectPath);
            const traceUrl = `projects/${encodedProjectPath}/jobs/${jobId}/trace`;
            const jobTrace = await this.gitlabClient.requester.get(traceUrl);

            if (!jobTrace || !jobTrace.body) {
              this.logger.info(
                `Got empty job log on attempt ${attempt} for job ${jobId}, will retry if attempts remain`
              );
              throw new Error('Empty job log received');
            }

            return `${log} ${String(jobTrace.body)}`;
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
            this.logger.warn(
              `Retry attempt ${attempt}/10 for logs job ${jobId} project ${projectPath}: ${error.message}`
            );
          },
        },
      );
    } catch (error) {
      const errorMessage = error;
      if (errorMessage === 'Empty job log received') {
        this.logger.warn(
          `Job ${jobId} in project ${projectPath} has an empty log after multiple retries. Continuing without its logs.`
        );
        return `${log} Log is empty`;
      }
      this.logger.error(`Failed to get logs for job ${jobId} in project ${projectPath} after multiple retries: ${error}`);
      throw error;
    }
  }

  public async getPipelineLogs(projectPath: string, pipelineId: number): Promise<string> {
    try {
      const allJobs = await this.getPipelineJobsInfo(projectPath, pipelineId);
      if (!allJobs){
        throw new Error(`No Jobs found in project ${projectPath} for pipeline #${pipelineId}`);
      }

      // Sort jobs by ID to ensure chronological order of logs
      allJobs.sort((a: GitLabJob, b: GitLabJob) => (a.id) - (b.id));

      const jobLogPromises = (allJobs as GitLabJob[]).map((job) => {
        if (!job.id && !job.name) {
          this.logger.error(
            `Job in pipeline ${pipelineId} is missing an ID or name. Skipping Job: ${JSON.stringify(job)}`
          );
          return Promise.resolve('');
        }
        return this.getJobLogs(projectPath, job.id, job.name);
      });

      const logs = await Promise.all(jobLogPromises);
      return logs.join('');
    } catch (error) {
      this.logger.error(`Failed to get logs for pipeline ${pipelineId} in project ${projectPath}: ${error}`);
      return 'Failed to retrieve job logs';
    }
  }

  public async cancelPipeline(projectPath: string, pipelineId: number): Promise<GitLabPipeline> {
    try {
      const cancelledPipeline = await this.gitlabClient.Pipelines.cancel(projectPath, pipelineId);
      this.logger.info(`Cancelled pipeline ${pipelineId} for project ${projectPath}`);
      return cancelledPipeline as GitLabPipeline;
    } catch (error) {
      this.logger.error(
        `Failed to cancel GitLab pipeline ${pipelineId} for project ${projectPath}: ${error}`
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
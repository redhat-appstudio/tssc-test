import { Octokit } from '@octokit/rest';
import retry from 'async-retry';
import { Endpoints } from '@octokit/types';
import {
  WorkflowJob,
  WorkflowRun,
  WorkflowRunFilter,
  WorkflowRunsResponse,
  WorkflowJobsResponse,
} from '../types/github.types';
import { GithubApiError, GithubNotFoundError, GithubWorkflowError } from '../errors/github.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

type ListWorkflowRunsForRepoParams =
  Endpoints['GET /repos/{owner}/{repo}/actions/runs']['parameters'];
type ListWorkflowRunsParams =
  Endpoints['GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs']['parameters'];

type ListWorkflowRunsForRepoResponse =
  Endpoints['GET /repos/{owner}/{repo}/actions/runs']['response'];
type ListWorkflowRunsResponse =
  Endpoints['GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs']['response'];

export interface GithubActionsServiceConfig {
  maxRetries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  defaultResultsPerPage?: number;
}

export class GithubActionsService {
  private readonly logger: Logger;
  private readonly octokit: Octokit;
  private readonly maxRetries: number;
  private readonly minTimeout: number;
  private readonly maxTimeout: number;
  private readonly factor: number;
  private readonly defaultResultsPerPage: number;

  constructor(octokit: Octokit, config: GithubActionsServiceConfig = {}) {
    this.logger = LoggerFactory.getLogger('github.actions');
    this.octokit = octokit;
    // Default values. This should correspond to 155 seconds in 5 retries(5, 10, 20, 40, 80 seconds)
    this.maxRetries = config.maxRetries ?? 5;
    this.minTimeout = config.minTimeout ?? 5000;
    this.maxTimeout = config.maxTimeout ?? 80000;
    this.factor = config.factor ?? 2;
    this.defaultResultsPerPage = config.defaultResultsPerPage ?? 100;
  }

  /**
   * Fetches workflow runs from the GitHub API based on the provided filters.
   * It dynamically chooses between listing workflow runs for a specific workflow ID
   * or for the entire repository.
   *
   * @param owner - The owner of the repository.
   * @param repo - The name of the repository.
   * @param filter - An object containing various filters for workflow runs.
   * @returns A Promise that resolves to the API response containing workflow runs.
   */
  private async fetchWorkflowRunsFromApi(
    owner: string,
    repo: string,
    filter: WorkflowRunFilter,
  ): Promise<ListWorkflowRunsResponse | ListWorkflowRunsForRepoResponse> {
    const commonParams:
      | ListWorkflowRunsParams
      | ListWorkflowRunsForRepoParams = {
      owner,
      repo,
      per_page: filter.per_page || this.defaultResultsPerPage,
    };

    if (filter.page !== undefined) {
      commonParams.page = filter.page;
    }
    if (filter.branch) {
      commonParams.branch = filter.branch;
    }
    if (filter.status) {
      commonParams.status = filter.status;
    }
    if (filter.event) {
      commonParams.event = filter.event;
    }
    if (filter.actor) {
      commonParams.actor = filter.actor;
    }

    if (filter.workflow_id) {
      const params: ListWorkflowRunsParams = {
        ...commonParams,
        workflow_id: filter.workflow_id,
      };
      return this.octokit.rest.actions.listWorkflowRuns(params);
    }

    const params: ListWorkflowRunsForRepoParams = {
      ...commonParams,
      ...(filter.head_sha && { head_sha: filter.head_sha }),
    };
    return this.octokit.rest.actions.listWorkflowRunsForRepo(params);
  }

  private applyPostApiFilters(
    runs: WorkflowRun[],
    filter: WorkflowRunFilter,
  ): WorkflowRun[] {
    let filteredRuns = runs;

    if (filter.head_sha) {
      filteredRuns = filteredRuns.filter(
        run => run && run.head_sha === filter.head_sha,
      );
    }

    if (filter.created_after) {
      const afterDate = filter.created_after.getTime();
      filteredRuns = filteredRuns.filter(run => {
        if (!run || !run.created_at) return false;
        return new Date(run.created_at).getTime() >= afterDate;
      });
    }

    if (filter.created_before) {
      const beforeDate = filter.created_before.getTime();
      filteredRuns = filteredRuns.filter(run => {
        if (!run || !run.created_at) return false;
        return new Date(run.created_at).getTime() <= beforeDate;
      });
    }

    if (filter.excludeInProgress) {
      filteredRuns = filteredRuns.filter(
        run => run && run.status !== 'in_progress',
      );
    }

    if (filter.excludeQueued) {
      filteredRuns = filteredRuns.filter(
        run =>
          run &&
          run.status &&
          !['queued', 'waiting', 'requested', 'pending'].includes(run.status),
      );
    }

    if (filter.latest) {
      const latestRuns = new Map<number, WorkflowRun>();
      for (const run of filteredRuns) {
        if (run && run.workflow_id) {
          const existingRun = latestRuns.get(run.workflow_id);
          if (
            !existingRun ||
            (run.created_at &&
              existingRun.created_at &&
              new Date(run.created_at) > new Date(existingRun.created_at))
          ) {
            latestRuns.set(run.workflow_id, run);
          }
        }
      }
      return Array.from(latestRuns.values());
    }

    return filteredRuns;
  }

  public async getWorkflowRuns(
    owner: string,
    repo: string,
    filter: WorkflowRunFilter = {},
  ): Promise<{ data: WorkflowRunsResponse }> {
    const filterDescription = Object.entries(filter)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');

    this.logger.info(
      `Fetching workflow runs for ${owner}/${repo}${filterDescription ? ` with filters: ${filterDescription}` : ''}`
    );

    try {
      return await retry(
        async bail => {
          try {
            const response = await this.fetchWorkflowRunsFromApi(
              owner,
              repo,
              filter,
            );

            const workflowRuns = (
              Array.isArray(response.data?.workflow_runs)
                ? response.data.workflow_runs
                : []
            ) as WorkflowRun[];
            this.logger.info(
              `Successfully fetched ${workflowRuns.length} workflow runs for ${owner}/${repo}`
            );

            const filteredRuns = this.applyPostApiFilters(
              workflowRuns,
              filter,
            );

            return {
              data: {
                total_count: filteredRuns.length,
                workflow_runs: filteredRuns,
              },
            };
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              this.logger.error(`Repository ${owner}/${repo} not found`);
              bail(new GithubNotFoundError('repository', `${owner}/${repo}`, error.status || 404));
            }
            this.logger.warn(
              'Error fetching workflow runs: {}. Retrying...',
              error
            );
            throw new GithubApiError(`Failed to fetch workflow runs for ${owner}/${repo}`, error.status, error);
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (err, attempt) => {
            this.logger.warn(
              `Retry attempt ${attempt}/${this.maxRetries} for workflow runs in ${owner}/${repo}: ${err}`
            );
          },
        },
      );
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch workflow runs after retries: {}',
        error
      );
      return {
        data: {
          total_count: 0,
          workflow_runs: [],
        },
      };
    }
  }

  public async getWorkflowRunByID(
    owner: string,
    repo: string,
    runId: number,
  ): Promise<{ data: WorkflowRun }> {
    this.logger.info(`Fetching workflow run #${runId} for ${owner}/${repo}`);

    try {
      return await retry(
        async bail => {
          try {
            const response = await this.octokit.rest.actions.getWorkflowRun({
              owner,
              repo,
              run_id: runId,
            });

            this.logger.info(
              `Successfully fetched workflow run #${runId} for ${owner}/${repo}`
            );
            return {
              data: response.data as unknown as WorkflowRun,
            };
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              this.logger.error(`Workflow run #${runId} not found for ${owner}/${repo}`);
              bail(new GithubNotFoundError('workflow run', `#${runId}`, error.status || 404));
            }
            this.logger.warn(
              `Error fetching workflow run #${runId}: ${error}. Retrying...`
            );
            throw new GithubApiError(`Failed to fetch workflow run #${runId} for ${owner}/${repo}`, error.status, error);
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (err, attempt) => {
            this.logger.warn(
              `Retry attempt ${attempt} for workflow run #${runId}: ${err}`
            );
          },
        },
      );
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch workflow run after retries: {}',
        error
      );
      throw error;
    }
  }

  public async listJobsForWorkflowRun(
    owner: string,
    repo: string,
    runId: number,
  ): Promise<{ data: WorkflowJobsResponse }> {
    this.logger.info(
      `Fetching jobs for workflow run #${runId} for ${owner}/${repo}`
    );

    try {
      const response = await retry(
        async bail => {
          try {
            const res = await this.octokit.rest.actions.listJobsForWorkflowRun({
              owner,
              repo,
              run_id: runId,
              per_page: 100,
            });

            this.logger.info(
              `Successfully fetched ${res.data.jobs?.length || 0} jobs for workflow run #${runId}`
            );
            return res;
          } catch (error: any) {
            if (
              error.status === 404 ||
              (error.response && error.response.status === 404)
            ) {
              this.logger.error(`Jobs for workflow run #${runId} not found`);
              bail(new GithubWorkflowError('job retrieval', `run #${runId}`, error.status || 404, error));
            }
            this.logger.warn(
              `Error fetching jobs for workflow run #${runId}: ${error}. Retrying...`
            );
            throw error;
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (err, attempt) => {
            this.logger.warn(
              `Retry attempt ${attempt} for jobs of workflow run #${runId}: ${err}`
            );
          },
        },
      );

      const jobs = Array.isArray(response.data?.jobs)
        ? response.data.jobs
        : [];

      return {
        data: {
          total_count: jobs.length,
          jobs: jobs as WorkflowJob[],
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch jobs for workflow run #${runId} after retries: ${error}`
      );
      throw new GithubApiError(`Failed to fetch jobs for workflow run #${runId} after retries`, error.status, error);
    }
  }

  public async getWorkflowJobLogs(
    owner: string,
    repo: string,
    jobId: number,
  ): Promise<string> {
    this.logger.info(`Fetching logs for job #${jobId} for ${owner}/${repo}`);

    try {
      return await retry(
        async bail => {
          try {
            const result =
              await this.octokit.rest.actions.downloadJobLogsForWorkflowRun({
                owner,
                repo,
                job_id: jobId,
              });
            const jobLogUrl = result.url;
            
            // Fetch logs with proper error handling
            const logResponse = await fetch(jobLogUrl);
            
            if (!logResponse.ok) {
              throw new Error(`Failed to fetch logs: HTTP ${logResponse.status} ${logResponse.statusText}`);
            }
            
            const logs = await logResponse.text();
            this.logger.info(`Successfully fetched logs for job #${jobId}`);
            return logs;
          } catch (error: any) {
            // Handle GitHub API errors (don't retry these)
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              this.logger.error(`Logs for job #${jobId} not found`);
              bail(new GithubWorkflowError('job logs retrieval', `#${jobId}`, error.status || 404));
            }

            // Handle fetch/network errors (these can be retried)
            if (error.message && error.message.includes('Failed to fetch logs: HTTP')) {
              this.logger.warn(`Network error fetching logs for job #${jobId}: ${error}. Retrying...`);
              throw error; // Let retry mechanism handle this
            }

            // Handle other errors
            this.logger.warn(
              `Error fetching logs for job #${jobId}: ${error}. Retrying...`
            );
            throw new GithubApiError(`Failed to fetch logs for job #${jobId} for ${owner}/${repo}`, error.status, error);
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (err, attempt) => {
            this.logger.warn(
              `Retry attempt ${attempt} for logs of job #${jobId}: ${err}`
            );
          },
        },
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch logs for job #${jobId} after retries: ${error}`
      );
      throw error;
    }
  }

  public async getWorkflowRunLogs(
    owner: string,
    repo: string,
    runId: number,
  ): Promise<string> {
    this.logger.info(
      `Fetching comprehensive logs for workflow run #${runId} for ${owner}/${repo}`
    );

    try {
      const jobsResponse = await this.listJobsForWorkflowRun(owner, repo, runId);
      const jobs = jobsResponse.data.jobs;

      if (jobs.length === 0) {
        this.logger.info(`No jobs found for workflow run #${runId}`);
        return `No jobs found for workflow run #${runId}`;
      }

      let allLogs = `=== Workflow Run #${runId} Logs ===\n\n`;

      for (const job of jobs) {
        if (!job || !job.id || !job.name) continue;

        allLogs += `\n--- Job: ${job.name} (ID: ${job.id}) ---\n`;
        allLogs += `Status: ${job.status || 'unknown'}, Conclusion: ${job.conclusion || 'in progress'}\n`;
        if (job.started_at) allLogs += `Started: ${job.started_at}\n`;
        if (job.completed_at) allLogs += `Completed: ${job.completed_at}\n`;
        allLogs += `\nJob Steps:\n`;

        try {
          const jobDetails = await this.getWorkflowJob(owner, repo, job.id);
          if (jobDetails.data?.steps) {
            for (const step of jobDetails.data.steps) {
              const stepStatus = step.conclusion || step.status || 'unknown';
              allLogs += `  - ${step.name}: ${stepStatus}\n`;
            }
          }
        } catch (stepError) {
          allLogs += `  Could not fetch step details: ${stepError instanceof Error ? stepError.message : String(stepError)}\n`;
        }

        allLogs += `\nJob Logs:\n`;
        try {
          const jobLogs = await this.getWorkflowJobLogs(owner, repo, job.id);
          allLogs += `${jobLogs}\n`;
        } catch (logError) {
          allLogs += `  Could not fetch job logs: ${logError instanceof Error ? logError.message : String(logError)}\n`;
        }
        allLogs += `\n${'='.repeat(50)}\n`;
      }

      return allLogs;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch comprehensive logs for workflow run #${runId}: ${error}`
      );
      throw new GithubApiError(`Failed to fetch comprehensive logs for workflow run #${runId}`, error.status, error);
    }
  }

  public async getWorkflowJob(
    owner: string,
    repo: string,
    jobId: number,
  ): Promise<{ data: WorkflowJob }> {
    this.logger.info(`Fetching workflow job #${jobId} for ${owner}/${repo}`);

    try {
      const response = await retry(
        async bail => {
          try {
            const res = await this.octokit.rest.actions.getJobForWorkflowRun({
              owner,
              repo,
              job_id: jobId,
            });
            this.logger.info(`Successfully fetched workflow job #${jobId}`);
            return res;
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              this.logger.error(`Workflow job #${jobId} not found`);
              bail(new GithubNotFoundError('workflow job', `#${jobId}`, error.status || 404));
            }
            this.logger.warn(
              `Error fetching workflow job #${jobId}: ${error}. Retrying...`
            );
            throw new GithubApiError(`Failed to fetch workflow job #${jobId} for ${owner}/${repo}`, error.status, error);
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (err, attempt) => {
            this.logger.warn(
              `Retry attempt ${attempt} for workflow job #${jobId}: ${err}`
            );
          },
        },
      );
      return { data: response.data as WorkflowJob };
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch workflow job #${jobId} after retries: ${error}`
      );
      throw error;
    }
  }

  public async findWorkflowRunByCommitSha(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<WorkflowRun | null> {
    if (!sha) {
      this.logger.warn('No commit SHA provided for findWorkflowRunByCommitSha');
      return null;
    }
    this.logger.info(
      `Finding workflow run for commit ${sha.substring(0, 7)} in ${owner}/${repo}`
    );

    try {
      const response = await this.getWorkflowRuns(owner, repo, {
        head_sha: sha,
        per_page: 10,
      });

      const runs = response.data.workflow_runs;

      if (runs.length > 0) {
        const matchingRun = runs[0];
        this.logger.info(
          `Found workflow run #${matchingRun.id} for commit ${sha.substring(0, 7)}`
        );
        return matchingRun;
      }
      this.logger.info(`No workflow run found for commit ${sha.substring(0, 7)}`);
      return null;
    } catch (error: any) {
      this.logger.error(
        `Error finding workflow run for commit ${sha.substring(0, 7)}: ${error}`
      );
      throw new GithubApiError(`Error finding workflow run for commit ${sha.substring(0, 7)}`, error.status, error);
    }
  }

  /**
   * Cancel a workflow run
   * 
   * @param owner Repository owner
   * @param repo Repository name
   * @param runId Workflow run ID to cancel
   * @returns Promise resolving when the workflow run is cancelled
   * @throws GithubNotFoundError if the workflow run is not found
   * @throws GithubApiError for other API errors
   */
  async cancelWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<void> {
    try {
      await retry(
        async () => {
          await this.octokit.actions.cancelWorkflowRun({
            owner,
            repo,
            run_id: runId,
          });
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (error: Error, attempt: number) => {
            this.logger.warn(
              `[GitHub Actions] Retry ${attempt}/${this.maxRetries} - Cancelling workflow run ${runId}: ${error.message}`
            );
          },
        }
      );

      this.logger.info(`[GitHub Actions] Successfully cancelled workflow run ${runId}`);
    } catch (error: any) {
      // Handle specific error cases
      if (error.status === 404) {
        throw new GithubNotFoundError(
          'workflow run',
          `${runId} in repository ${owner}/${repo}`
        );
      }

      if (error.status === 403) {
        throw new GithubApiError(
          `Insufficient permissions to cancel workflow run ${runId}`,
          error.status
        );
      }

      if (error.status === 409) {
        throw new GithubApiError(
          `Workflow run ${runId} cannot be cancelled (already completed or not cancellable)`,
          error.status
        );
      }

      // Re-throw with more context
      throw new GithubApiError(
        `Failed to cancel workflow run ${runId}: ${error.message}`,
        error.status || 500,
        error
      );
    }
  }
}

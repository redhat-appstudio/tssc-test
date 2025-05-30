import { EventType } from '../../rhtap/core/integration/ci';
import { GithubClient, GithubClientOptions } from '../git/githubClient';
import { GitHubClientFactory } from '../git/githubClientFactory';
import retry_fn from 'async-retry';

/**
 * GitHub workflow run filter options
 * Provides flexible filtering for workflow runs
 */
export interface WorkflowRunFilter {
  status?:
    | 'completed'
    | 'action_required'
    | 'cancelled'
    | 'failure'
    | 'neutral'
    | 'skipped'
    | 'stale'
    | 'success'
    | 'timed_out'
    | 'in_progress'
    | 'queued'
    | 'requested'
    | 'waiting'
    | 'pending';
  branch?: string; // Filter by branch name
  head_sha?: string; // Filter by commit SHA
  event?: EventType; // Filter by event type (e.g. push, pull_request)
  actor?: string; // Filter by GitHub username
  creator_id?: number; // Filter by the GitHub user ID that triggered the run (internal use)
  workflow_id?: number | string; // Filter by workflow ID or filename
  created_after?: Date; // Filter by creation date (after)
  created_before?: Date; // Filter by creation date (before)
  excludeInProgress?: boolean; // Exclude runs that are still in progress
  excludeQueued?: boolean; // Exclude runs that are queued
  latest?: boolean; // Return only the latest run per workflow
  per_page?: number; // Number of results per page (max 100)
  page?: number; // Page number for pagination
}

// Type definition for GitHub workflow run matching GitHub API return type
export interface WorkflowRun {
  id: number;
  name?: string | null;
  node_id: string;
  head_branch: string | null;
  head_sha: string;
  path?: string;
  run_number: number;
  event: string;
  status: string | null;
  conclusion?: string | null;
  workflow_id: number;
  check_suite_id?: number;
  check_suite_node_id?: string;
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  actor?: {
    login: string;
    id: number;
    node_id?: string;
    avatar_url?: string;
    url?: string;
  } | null;
  run_attempt?: number;
  referenced_workflows?: Array<any>;
  run_started_at?: string;
  triggering_actor?: any;
  jobs_url?: string;
  logs_url?: string;
  check_suite_url?: string;
  artifacts_url?: string;
  cancel_url?: string;
  rerun_url?: string;
  workflow_url?: string;
  repository?: {
    id: number;
    name: string;
    full_name: string;
    node_id?: string;
  };
  head_repository_id?: number;
  head_commit?: any;
  display_title: string;
}

export interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

// Interface for GitHub workflow job
export interface WorkflowJob {
  id: number;
  run_id: number;
  run_url: string;
  node_id: string;
  head_sha: string;
  url: string;
  html_url: string | null;
  status: string;
  conclusion?: string | null;
  started_at: string | null;
  completed_at?: string | null;
  name: string;
  steps?: Array<{
    name: string;
    status: string;
    conclusion?: string | null;
    number: number;
    started_at?: string | null;
    completed_at?: string | null;
  }>;
  check_run_url: string;
  labels: string[];
  runner_id?: number | null;
  runner_name?: string | null;
  runner_group_id?: number | null;
  runner_group_name?: string | null;
  [key: string]: any; // Allow additional properties from GitHub API
}

export interface WorkflowJobsResponse {
  total_count: number;
  jobs: WorkflowJob[];
}

export class GitHubActionsClient {
  private githubClient: GithubClient;
  private maxRetries: number = 5;
  private minTimeout: number = 5000;
  private maxTimeout: number = 10000;
  private factor: number = 2;
  private defaultResultsPerPage: number = 100;

  constructor(options: GithubClientOptions) {
    // Get the client from the factory instead of creating a new one
    const clientFactory = GitHubClientFactory.getInstance();

    // Get or create a client with the provided options
    this.githubClient = clientFactory.getClient({
      ...options,
      retryOptions: {
        retries: 3,
        doNotRetry: ['404'], // Don't retry not found errors
      },
      throttleOptions: {
        maxRetries: 2,
      },
    });
  }

  /**
   * Comprehensive method to get workflow runs for a repository with flexible filtering
   *
   * This method provides extensive filtering options to find exactly the workflow runs
   * you need. It uses both the GitHub API's native filtering and post-processing for
   * filters not supported by the API.
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param filter - Optional filter parameters
   * @returns Promise with workflow runs response
   */
  public async getWorkflowRuns(
    owner: string,
    repo: string,
    filter: WorkflowRunFilter = {}
  ): Promise<{ data: WorkflowRunsResponse }> {
    // Build a log message with active filters
    const filterDescription = Object.entries(filter)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        if (value instanceof Date) {
          return `${key}=${value.toISOString()}`;
        }
        return `${key}=${String(value)}`;
      })
      .join(', ');

    console.log(
      `Fetching workflow runs for ${owner}/${repo}${filterDescription ? ` with filters: ${filterDescription}` : ''}`
    );

    try {
      // Use async-retry for resilience
      return await retry_fn(
        async bail => {
          try {
            // Build API request parameters from filter
            // Only include parameters that GitHub API supports directly
            const requestParams: any = {
              owner,
              repo,
              per_page: filter.per_page || this.defaultResultsPerPage,
              ...(filter.page !== undefined && { page: filter.page }),
              ...(filter.branch && { branch: filter.branch }),
              ...(filter.status && { status: filter.status }),
              ...(filter.event && { event: filter.event }),
              ...(filter.actor && { actor: filter.actor }),
              ...(filter.head_sha && { head_sha: filter.head_sha }),
            };

            // If a specific workflow_id is provided, use the workflow-specific endpoint
            let response;
            if (filter.workflow_id) {
              // The workflow_id could be a numeric ID or a workflow file name
              const workflow_id =
                typeof filter.workflow_id === 'number'
                  ? filter.workflow_id
                  : String(filter.workflow_id);

              const workflowParams: any = {
                owner,
                repo,
                workflow_id,
                per_page: filter.per_page || this.defaultResultsPerPage,
                ...(filter.page !== undefined && { page: filter.page }),
                ...(filter.branch && { branch: filter.branch }),
                ...(filter.status && { status: filter.status }),
                ...(filter.event && { event: filter.event }),
                ...(filter.actor && { actor: filter.actor }),
              };
              response = await this.githubClient
                .getOctokit()
                .rest.actions.listWorkflowRuns(workflowParams);
            } else {
              response = await this.githubClient
                .getOctokit()
                .rest.actions.listWorkflowRunsForRepo(requestParams);
            }

            // Cast the response to our interface type to handle GitHub API's complex return type
            let workflowRuns = (
              Array.isArray(response.data?.workflow_runs) ? response.data.workflow_runs : []
            ) as WorkflowRun[];
            console.log(
              `Successfully fetched ${workflowRuns.length} workflow runs for ${owner}/${repo}`
            );

            // If no runs found, contine to get workflow runs until it reaches the maximum number of retries
            if (workflowRuns.length === 0) {
              console.warn(
                `No workflow runs found for ${owner}/${repo} with the specified filters, will retry...`
              );
              throw new Error('No workflow runs found yet');
            }

            // Apply post-processing filters for parameters not supported by GitHub API

            // Filter by head_sha if specified
            if (filter.head_sha) {
              workflowRuns = workflowRuns.filter(run => run && run.head_sha === filter.head_sha);
              console.log(
                `Filtered to ${workflowRuns.length} workflow runs with SHA: ${filter.head_sha}`
              );
            }

            // Filter by creation date range
            if (filter.created_after) {
              const afterDate = filter.created_after.getTime();
              workflowRuns = workflowRuns.filter(run => {
                if (!run || !run.created_at) return false;
                const runDate = new Date(run.created_at).getTime();
                return runDate >= afterDate;
              });
              console.log(
                `Filtered to ${workflowRuns.length} workflow runs created after: ${filter.created_after.toISOString()}`
              );
            }

            if (filter.created_before) {
              const beforeDate = filter.created_before.getTime();
              workflowRuns = workflowRuns.filter(run => {
                if (!run || !run.created_at) return false;
                const runDate = new Date(run.created_at).getTime();
                return runDate <= beforeDate;
              });
              console.log(
                `Filtered to ${workflowRuns.length} workflow runs created before: ${filter.created_before.toISOString()}`
              );
            }

            // Filter out in-progress runs if requested
            if (filter.excludeInProgress) {
              workflowRuns = workflowRuns.filter(run => run && run.status !== 'in_progress');
              console.log(
                `Filtered to ${workflowRuns.length} workflow runs (excluding in_progress)`
              );
            }

            // Filter out queued runs if requested
            if (filter.excludeQueued) {
              workflowRuns = workflowRuns.filter(
                run =>
                  run &&
                  run.status &&
                  !['queued', 'waiting', 'requested', 'pending'].includes(run.status)
              );
              console.log(
                `Filtered to ${workflowRuns.length} workflow runs (excluding queued/waiting/etc)`
              );
            }

            // Keep only the latest run per workflow if requested
            if (filter.latest) {
              const latestRuns = new Map<number, WorkflowRun>();
              for (const run of workflowRuns) {
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
              workflowRuns = Array.from(latestRuns.values());
              console.log(`Filtered to ${workflowRuns.length} latest workflow runs`);
            }

            // Return the filtered results with explicit typing to satisfy TypeScript
            return {
              data: {
                total_count: workflowRuns.length,
                workflow_runs: workflowRuns,
              } as WorkflowRunsResponse,
            };
          } catch (error: any) {
            // If it's a 404, don't retry
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              console.error(`Repository ${owner}/${repo} not found`);
              bail(new Error(`Repository ${owner}/${repo} not found`));
              throw error; // Keep TypeScript happy
            }

            // For network errors or unexpected issues
            console.warn(
              `Error fetching workflow runs: ${error instanceof Error ? error.message : String(error)}. Retrying...`
            );
            throw error; // Throw to trigger retry
          }
        },
        {
          retries: this.maxRetries,
          minTimeout: this.minTimeout,
          maxTimeout: this.maxTimeout,
          factor: this.factor,
          onRetry: (err, attempt) => {
            console.log(
              `[GITHUAB_ACTIONS-RETRY ${attempt}/5] 🔄 Project: ${owner}/${repo} | Status: Failed | Reason: ${err}`
            );
          },
        }
      );
    } catch (error: any) {
      console.error(
        `Failed to fetch workflow runs after retries: ${error instanceof Error ? error.message : String(error)}`
      );
      // Return empty data structure instead of throwing
      return {
        data: {
          total_count: 0,
          workflow_runs: [],
        } as WorkflowRunsResponse,
      };
    }
  }

  /**
   * Get a specific workflow run by ID with retry capabilities
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param runId - Workflow run ID
   * @returns Promise with workflow run details
   */
  public async getWorkflowRunByID(
    owner: string,
    repo: string,
    runId: number
  ): Promise<{ data: WorkflowRun }> {
    console.log(`Fetching workflow run #${runId} for ${owner}/${repo}`);

    try {
      return await retry_fn(
        async bail => {
          try {
            const response = await this.githubClient.getOctokit().rest.actions.getWorkflowRun({
              owner,
              repo,
              run_id: runId,
            });

            console.log(`Successfully fetched workflow run #${runId} for ${owner}/${repo}`);
            // Cast response data to expected interface with proper typing
            return {
              data: response.data as unknown as WorkflowRun,
            };
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              console.error(`Workflow run #${runId} not found for ${owner}/${repo}`);
              bail(new Error(`Workflow run #${runId} not found`));
              throw error;
            }

            console.warn(
              `Error fetching workflow run #${runId}: ${error instanceof Error ? error.message : String(error)}. Retrying...`
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
            console.log(`Retry attempt ${attempt} for workflow run #${runId}: ${err}`);
          },
        }
      );
    } catch (error: any) {
      console.log(
        `Failed to fetch workflow run after retries: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * List jobs for a specific workflow run with retry capabilities
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param runId - Workflow run ID
   * @returns Promise with jobs for the workflow run
   */
  public async listJobsForWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<{ data: WorkflowJobsResponse }> {
    console.log(`Fetching jobs for workflow run #${runId} for ${owner}/${repo}`);

    try {
      const response = await retry_fn(
        async bail => {
          try {
            const response = await this.githubClient
              .getOctokit()
              .rest.actions.listJobsForWorkflowRun({
                owner,
                repo,
                run_id: runId,
                per_page: 100,
              });

            console.log(
              `Successfully fetched ${response.data.jobs?.length || 0} jobs for workflow run #${runId}`
            );
            return response;
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              console.error(`Jobs for workflow run #${runId} not found`);
              bail(new Error(`Jobs for workflow run #${runId} not found`));
              throw error;
            }

            console.warn(
              `Error fetching jobs for workflow run #${runId}: ${error instanceof Error ? error.message : String(error)}. Retrying...`
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
            console.log(`Retry attempt ${attempt} for jobs of workflow run #${runId}: ${err}`);
          },
        }
      );

      const jobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];

      return {
        data: {
          total_count: jobs.length,
          jobs: jobs as WorkflowJob[],
        },
      };
    } catch (error: any) {
      console.error(
        `Failed to fetch jobs for workflow run #${runId} after retries: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get logs for a workflow run job with retry capabilities
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param jobId - Job ID
   * @returns Promise with job logs download URL
   */
  public async getWorkflowJobLogs(owner: string, repo: string, jobId: number): Promise<string> {
    console.log(`Fetching logs for job #${jobId} for ${owner}/${repo}`);

    try {
      const logs = await retry_fn(
        async bail => {
          try {
            const result = await this.githubClient
              .getOctokit()
              .rest.actions.downloadJobLogsForWorkflowRun({
                owner,
                repo,
                job_id: jobId,
              });
            const jobLogUrl = result.url;
            // Fetch the log content from the download URL
            const logResponse = await fetch(jobLogUrl);
            const logs = await logResponse.text();
            console.log(`Successfully fetched logs for job #${jobId}`);
            return logs;
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              console.error(`Logs for job #${jobId} not found`);
              bail(new Error(`Logs for job #${jobId} not found`));
              throw error;
            }

            console.warn(
              `Error fetching logs for job #${jobId}: ${error instanceof Error ? error.message : String(error)}. Retrying...`
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
            console.log(`Retry attempt ${attempt} for logs of job #${jobId}: ${err}`);
          },
        }
      );

      return logs;
    } catch (error: any) {
      console.error(`Failed to fetch logs for job #${jobId} after retries: ${error.message}`);
      throw error;
    }
  }

  public async getWorkflowRunLogs(owner: string, repo: string, runId: number): Promise<string> {
    console.log(`Fetching comprehensive logs for workflow run #${runId} for ${owner}/${repo}`);

    try {
      // First, get the jobs for this workflow run
      const jobsResponse = await this.listJobsForWorkflowRun(owner, repo, runId);
      const jobs = Array.isArray(jobsResponse.data?.jobs) ? jobsResponse.data.jobs : [];

      if (jobs.length === 0) {
        console.log(`No jobs found for workflow run #${runId}`);
        return `No jobs found for workflow run #${runId}`;
      }

      let allLogs = `=== Workflow Run #${runId} Logs ===\n\n`;

      // Process logs for each job
      for (const job of jobs) {
        if (!job || !job.id || !job.name) continue;

        allLogs += `\n--- Job: ${job.name} (ID: ${job.id}) ---\n`;
        allLogs += `Status: ${job.status || 'unknown'}, Conclusion: ${job.conclusion || 'in progress'}\n`;

        if (job.started_at) {
          allLogs += `Started: ${job.started_at}\n`;
        }
        if (job.completed_at) {
          allLogs += `Completed: ${job.completed_at}\n`;
        }

        allLogs += `\nJob Steps:\n`;

        // Get job details to see steps
        try {
          const jobDetails = await this.getWorkflowJob(owner, repo, job.id);
          if (jobDetails.data?.steps) {
            for (const step of jobDetails.data.steps) {
              if (step.name) {
                const stepStatus = step.conclusion || step.status || 'unknown';
                allLogs += `  - ${step.name}: ${stepStatus}\n`;
                if (step.started_at) {
                  allLogs += `    Started: ${step.started_at}\n`;
                }
                if (step.completed_at) {
                  allLogs += `    Completed: ${step.completed_at}\n`;
                }
              }
            }
          }
        } catch (stepError) {
          allLogs += `  Could not fetch step details: ${stepError instanceof Error ? stepError.message : String(stepError)}\n`;
        }

        allLogs += `\nJob Logs:\n`;

        // Fetch the actual job logs using getWorkflowJobLogs
        try {
          const jobLogs = await this.getWorkflowJobLogs(owner, repo, job.id);
          allLogs += jobLogs;
          allLogs += `\n`;
        } catch (logError) {
          allLogs += `  Could not fetch job logs: ${logError instanceof Error ? logError.message : String(logError)}\n`;
        }

        allLogs += `\n${'='.repeat(50)}\n`;
      }

      // Add workflow run download URL
      try {
        const response = await retry_fn(
          async () => {
            return await this.githubClient.getOctokit().rest.actions.downloadWorkflowRunLogs({
              owner,
              repo,
              run_id: runId,
            });
          },
          {
            retries: 2,
            minTimeout: 1000,
            maxTimeout: 3000,
          }
        );

        if (response.url) {
          allLogs += `\nComplete workflow logs download URL: ${response.url}\n`;
        } else if (response.data) {
          allLogs += `\nWorkflow logs data available (binary/zip format)\n`;
        }
      } catch (downloadError) {
        allLogs += `\nNote: Could not generate workflow logs download URL: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}\n`;
      }

      console.log(`Successfully compiled logs for workflow run #${runId}`);
      return allLogs;
    } catch (error: any) {
      console.error(
        `Failed to fetch comprehensive logs for workflow run #${runId}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get a specific workflow job details with retry capabilities
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param jobId - Job ID
   * @returns Promise with job details
   */
  public async getWorkflowJob(owner: string, repo: string, jobId: number): Promise<any> {
    console.log(`Fetching workflow job #${jobId} for ${owner}/${repo}`);

    try {
      return await retry_fn(
        async bail => {
          try {
            const response = await this.githubClient
              .getOctokit()
              .rest.actions.getJobForWorkflowRun({
                owner,
                repo,
                job_id: jobId,
              });

            console.log(`Successfully fetched workflow job #${jobId}`);
            return response;
          } catch (error: any) {
            if (error.status === 404 || (error.response && error.response.status === 404)) {
              console.error(`Workflow job #${jobId} not found`);
              bail(new Error(`Workflow job #${jobId} not found`));
              throw error;
            }

            console.warn(
              `Error fetching workflow job #${jobId}: ${error instanceof Error ? error.message : String(error)}. Retrying...`
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
            console.log(`Retry attempt ${attempt} for workflow job #${jobId}: ${err}`);
          },
        }
      );
    } catch (error: any) {
      console.error(`Failed to fetch workflow job #${jobId} after retries: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find a workflow run by commit SHA
   * This is useful when you want to find the workflow run triggered by a specific commit
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param sha - Commit SHA to search for
   * @returns Promise with workflow run if found, null otherwise
   */
  public async findWorkflowRunByCommitSha(
    owner: string,
    repo: string,
    sha: string
  ): Promise<WorkflowRun | null> {
    if (!sha) {
      console.warn('No commit SHA provided for findWorkflowRunByCommitSha');
      return null;
    }
    console.log(`Finding workflow run for commit ${sha.substring(0, 7)} in ${owner}/${repo}`);

    try {
      // Use our getWorkflowRuns method with head_sha filter
      // This ensures we handle errors consistently
      const response = await this.getWorkflowRuns(owner, repo, {
        head_sha: sha,
        per_page: 10, // Get a few in case we need to sort them
      });

      const runs = Array.isArray(response.data?.workflow_runs) ? response.data.workflow_runs : [];

      if (runs.length > 0) {
        // Get the most recent run (they should be sorted by creation date descending)
        const matchingRun = runs[0];
        if (matchingRun && matchingRun.id) {
          console.log(`Found workflow run #${matchingRun.id} for commit ${sha.substring(0, 7)}`);
          return matchingRun;
        }
      }
      console.log(`No workflow run found for commit ${sha.substring(0, 7)}`);
      return null;
    } catch (error: any) {
      console.error(
        `Error finding workflow run for commit ${sha.substring(0, 7)}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
}

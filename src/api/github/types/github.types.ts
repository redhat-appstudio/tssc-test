import { EventType } from '../../../rhtap/core/integration/ci';

export interface GithubClientOptions {
  token: string;
  baseUrl?: string;
  timeout?: number;
  retryOptions?: {
    retries?: number;
    doNotRetry?: string[];
  };
  throttleOptions?: {
    maxRetries?: number;
  };
}



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
  branch?: string;
  head_sha?: string;
  event?: EventType;
  actor?: string;
  creator_id?: number;
  workflow_id?: number | string;
  created_after?: Date;
  created_before?: Date;
  excludeInProgress?: boolean;
  excludeQueued?: boolean;
  latest?: boolean;
  per_page?: number;
  page?: number;
}

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
  url: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

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
}

export interface WorkflowJobsResponse {
  total_count: number;
  jobs: WorkflowJob[];
}

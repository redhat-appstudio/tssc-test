import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { GitLabClient, GitLabConfigBuilder } from '../../../../../api/gitlab';
// import { GitLabClient } from '../../../../../api/git/gitlabClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';
import retry from 'async-retry';

export class GitLabCI extends BaseCI {
  private componentName: string;
  private secret!: Record<string, string>;
  private baseUrl: string = '';
  private gitlabCIClient!: GitLabClient;
  // private gitlabClient!: GitLabClient;
  private gitOpsRepoName: string;
  private sourceRepoName: string;

  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.GITLABCI, kubeClient);
    this.componentName = componentName;
    this.sourceRepoName = componentName;
    this.gitOpsRepoName = `${componentName}-gitops`;
  }

  private async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-gitlab-integration', 'tssc');
    if (!secret) {
      throw new Error('GitLab secret not found in the cluster. Please ensure the secret exists.');
    }
    this.secret = secret;
    return secret;
  }

  public async initialize(): Promise<void> {
    await this.loadSecret();
    this.gitlabCIClient = await this.initGitlabCIClient();
    // this.gitlabClient = this.gitlabCIClient.getGitlabClient();
  }

  /**
   * Initialize GitLab client with token
   * @returns Promise with GitLab client
   */
  private async initGitlabCIClient(): Promise<GitLabClient> {
    const gitlabToken = this.getToken();
    const hostname = this.getHost();
    this.baseUrl = `https://${hostname}`;
    // Initialize the GitLab client with the new config pattern
    const config = GitLabConfigBuilder
      .create(this.baseUrl, gitlabToken)
      .build();
    const gitlabCIClient = new GitLabClient(config);
    return gitlabCIClient;
  }

  public getToken(): string {
    if (!this.secret?.token) {
      throw new Error('GitLab token not found in the secret. Please ensure the token is provided.');
    }
    return this.secret.token;
  }

  public getHost(): string {
    if (!this.secret?.host) {
      throw new Error(`Host not found in the secret. Please ensure the host is provided.`);
    }
    return this.secret.host;
  }

  public getGroup(): string {
    if (!this.secret?.group) {
      throw new Error('GitLab group not found in the secret. Please ensure the group is provided.');
    }
    return this.secret.group;
  }

  public override async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    try {
      // Convert our standardized status to GitLab status strings to filter pipelines
      // the Mapping needs to be updated according GitLab status names
      const gitlabStatusMap: Record<PipelineStatus, string | null> = {
        [PipelineStatus.SUCCESS]: 'success',
        [PipelineStatus.FAILURE]: 'failed',
        [PipelineStatus.RUNNING]: 'running',
        [PipelineStatus.PENDING]: 'pending',
        [PipelineStatus.UNKNOWN]: null, // No direct mapping, will fetch all statuses
      };

      // Get GitLab status filter or null if no direct mapping
      const gitlabStatus = gitlabStatusMap[pipelineStatus];

      // Fetch pipelines for the repository and commit SHA
      let pipelines = await this.gitlabCIClient.getPipelines(
        `${this.getGroup()}/${pullRequest.repository}`,
        pullRequest.sha,
        gitlabStatus === null ? undefined : gitlabStatus
      );

      if (!pipelines || pipelines.length === 0) {
        console.log(
          `No pipelines found for repository ${pullRequest.repository} with SHA ${pullRequest.sha}`
        );
        return null;
      }

      // Filter pipelines by the requested event type if provided, the event type maps the GitLab pipeline source property
      if (eventType === EventType.PULL_REQUEST || eventType === EventType.PUSH) {
        pipelines.map(pipeline => {
          console.log(`Pipeline ID: ${pipeline.id}, Source: ${pipeline.source}`);
        });
        pipelines = pipelines.filter(
          pipeline => pipeline.source === 'push' || pipeline.source === 'merge_request_event'
        );

        // Check if pipelines array is empty after filtering
        if (pipelines.length === 0) {
          console.log(
            `No pipelines found for repository ${pullRequest.repository} with SHA ${pullRequest.sha} after filtering by event type`
          );
          return null;
        }
      }

      // Find the most recent pipeline by updated_at timestamp
      pipelines.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      const latestPipeline = pipelines[0];
      //TODO: for debugging purpose, remove it later
      console.log(`Latest pipeline ID: ${latestPipeline.id}, Source: ${latestPipeline.source}`);
      const mappedStatus = this.mapPipelineStatus(latestPipeline.status);

      // Only return pipelines that match the requested status if it's not UNKNOWN
      if (pipelineStatus !== PipelineStatus.UNKNOWN && mappedStatus !== pipelineStatus) {
        console.log(
          `Latest pipeline status ${mappedStatus} doesn't match requested status ${pipelineStatus}`
        );
        return null;
      }

      // Convert GitLab pipeline to our standardized Pipeline object
      return Pipeline.createGitLabPipeline(
        latestPipeline.id,
        mappedStatus,
        pullRequest.repository,
        '', // Logs will be fetched separately when needed
        JSON.stringify(latestPipeline), // Store raw pipeline data in results
        latestPipeline.web_url,
        latestPipeline.sha
      );
    } catch (error) {
      console.error(`Error fetching GitLab pipelines:`, error);
      return null;
    }
  }

  // the following is the status of pipelines:
  // created, waiting_for_resource, preparing, pending, running, success, failed, canceled, skipped, manual, scheduled.
  // so we think that "success", "failed", "canceled", and "skipped" represent a completed state for the pipeline.
  protected override async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline) {
      throw new Error('Pipeline is not defined');
    }

    try {
      // Get the latest pipeline status from GitLab
      const pipelineId = parseInt(pipeline.id, 10);
      if (isNaN(pipelineId)) {
        throw new Error(`Invalid pipeline ID: ${pipeline.id}`);
      }

      // Get updated pipeline information from GitLab
      const gitlabPipeline = await this.gitlabCIClient.getPipelineById(
        `${this.getGroup()}/${pipeline.repositoryName}`,
        pipelineId
      );

      // Handle completed states according to GitLab's definition
      // success, failed, canceled, and skipped represent a completed state
      const gitlabStatus = gitlabPipeline.status.toLowerCase();
      if (gitlabStatus === 'success') {
        return PipelineStatus.SUCCESS;
      } else if (gitlabStatus === 'failed' || gitlabStatus === 'canceled') {
        return PipelineStatus.FAILURE;
      } else if (gitlabStatus === 'skipped') {
        // For skipped pipelines, we map to FAILURE to ensure they're considered "completed"
        // This ensures consistency with the waitForAllPipelinesToFinish method
        return PipelineStatus.FAILURE;
      }

      // For all other statuses, use the standard mapping
      const mappedStatus = this.mapPipelineStatus(gitlabStatus);
      return mappedStatus;
    } catch (error) {
      console.error(`Error checking pipeline status for ${pipeline.id}:`, error);
      return PipelineStatus.UNKNOWN;
    }
  }

  public override async waitForAllPipelineRunsToFinish(): Promise<void> {
    try {
      console.log(
        `Waiting for all GitLab CI pipelines for component ${this.componentName} to finish...`
      );
      const maxAttempts = 20;
      const pollIntervalMs = 5000; // Poll every 5 seconds

      // Define the operation to check for running pipelines
      const checkPipelines = async (): Promise<boolean> => {
        // Get all pipelines for the component repository
        const allPipelines = await this.gitlabCIClient.getAllPipelines(
          `${this.getGroup()}/${this.sourceRepoName}`
        );

        if (!allPipelines || allPipelines.length === 0) {
          console.log(`No pipelines found for component ${this.componentName}`);
          return true;
        }

        // the following is the status of pipelines:
        // created, waiting_for_resource, preparing, pending, running, success, failed, canceled, skipped, manual, scheduled.
        // so we think that "success", "failed", "canceled", and "skipped" represent a completed state for the pipeline.
        const allIncompletePipelines = allPipelines.filter(
          pipeline =>
            pipeline.status !== 'success' &&
            pipeline.status !== 'failed' &&
            pipeline.status !== 'canceled' &&
            pipeline.status !== 'skipped'
        );

        if (allIncompletePipelines.length === 0) {
          console.log(`No running or pending pipelines found for component ${this.componentName}`);
          return true;
        }

        console.log(
          `Found ${allIncompletePipelines.length} active pipelines for component ${this.componentName}`
        );

        // If there are incomplete pipelines, throw an error to trigger retry
        throw new Error(`Waiting for ${allIncompletePipelines.length} pipeline(s) to complete`);
      };

      // Run the operation with retries
      try {
        await retry(checkPipelines, {
          retries: maxAttempts,
          minTimeout: pollIntervalMs,
          onRetry: (error: Error, attemptNumber: number) => {
            console.log(
              `[GITLAB-CI-RETRY ${attemptNumber}/${maxAttempts}] 🔄 Component: ${this.componentName} | Status: Waiting | Reason: ${error.message}`
            );
          },
        });

        console.log(
          `All GitLab CI pipelines for component ${this.componentName} have finished processing.`
        );
      } catch (error: any) {
        console.log(
          `Timeout reached. Some pipeline(s) still running after ${maxAttempts} attempts.`
        );
      }
    } catch (error) {
      console.error(`Error waiting for GitLab CI pipelines to finish:`, error);
      throw new Error(`Failed to wait for pipelines: ${error}`);
    }
  }

  public override async cancelAllInitialPipelines(): Promise<void> {
    try{
      const allPipelines = await this.gitlabCIClient.getAllPipelines(
        `${this.getGroup()}/${this.sourceRepoName}`
      );
      if (!allPipelines || allPipelines.length === 0) {
          throw new Error(`No pipelines found for component ${this.componentName}`);
      }

      console.log(`Found ${allPipelines.length} pipelines for ${this.componentName}`);

      await Promise.all(
        allPipelines
        .filter(pipeline => pipeline.status !== 'failed')
        .map(pipeline => {
          console.log(`Cancelling initial pipeline ${pipeline.id} with status ${pipeline.status}`);
          return this.gitlabCIClient.cancelPipeline(
            `${this.getGroup()}/${this.sourceRepoName}`,
            pipeline.id
          );
        })
      );

    } catch (error: any) {
      console.error(`Error while cancelling pipelines: ${error}`);
    }
  }

  public override async getWebhookUrl(): Promise<string> {
    throw new Error('GitLab does not support webhooks in the same way as other CI systems.');
  }

  public override getIntegrationSecret(): Promise<Record<string, string>> {
    return Promise.resolve(this.secret);
  }

  public override async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    const pipelineId = parseInt(pipeline.id);
    if (isNaN(pipelineId)) {
      throw new Error(`Invalid pipeline ID: ${pipeline.id}`);
    }
    return this.gitlabCIClient.getPipelineLogs(
      `${this.getGroup()}/${pipeline.repositoryName}`,
      pipelineId
    );
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return '.gitlab-ci.yml';
  }

  /**
   * Maps GitLab pipeline status to our standardized PipelineStatus enum
   * @param gitlabStatus The status string from GitLab API
   * @returns The standardized PipelineStatus value
   */
  public mapPipelineStatus(gitlabStatus: string): PipelineStatus {
    switch (gitlabStatus) {
      case 'success':
        return PipelineStatus.SUCCESS;
      case 'failed':
      case 'canceled':
        return PipelineStatus.FAILURE;
      case 'running':
        return PipelineStatus.RUNNING;
      case 'pending':
      case 'created':
      case 'waiting_for_resource':
      case 'preparing':
      case 'manual':
      case 'scheduled':
        return PipelineStatus.PENDING;
      case 'skipped':
        return PipelineStatus.FAILURE; // Treat skipped as failure for consistency
      default:
        return PipelineStatus.UNKNOWN;
    }
  }
}

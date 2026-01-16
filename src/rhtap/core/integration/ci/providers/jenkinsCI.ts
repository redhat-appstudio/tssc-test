import {
  CredentialType,
  JenkinsBuild,
  JenkinsBuildResult,
  JenkinsBuildTrigger,
  JenkinsClient,
} from '../../../../../api/jenkins';
// ... existing code ...
import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import {
  CIType,
  EventType,
  Pipeline,
  PipelineStatus,
  CancelPipelineOptions,
  CancelResult,
  MutableCancelResult,
  MutablePipelineCancelDetail,
  MutableCancelError,
} from '../ciInterface';
import retry from 'async-retry';
import { JobActivityStatus } from '../../../../../api/jenkins';

export class JenkinsCI extends BaseCI {
  private jenkinsClient!: JenkinsClient;
  private componentName: string;
  private secret!: Record<string, string>;

  // Standardized retry configuration
  private static readonly MAX_RETRIES = 10;
  private static readonly MIN_TIMEOUT = 2000; // 2 seconds
  private static readonly MAX_TIMEOUT = 15000; // 15 seconds
  private static readonly BACKOFF_FACTOR = 1.5;

  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.JENKINS, kubeClient);
    this.componentName = componentName;
  }

  /**
   * Convert a JenkinsBuild to a Pipeline object
   * Helper method to transform a Jenkins build into the standardized Pipeline format
   */
  private convertBuildToPipeline(
    build: JenkinsBuild,
    jobName: string,
    repositoryName: string,
    logs: string = '',
    sha?: string
  ): Pipeline {
    // Map Jenkins build status to standardized PipelineStatus
    let status = PipelineStatus.UNKNOWN;

    if (build.building) {
      status = PipelineStatus.RUNNING;
    } else if (build.result) {
      switch (build.result) {
        case JenkinsBuildResult.SUCCESS:
          status = PipelineStatus.SUCCESS;
          break;
        case JenkinsBuildResult.FAILURE:
          status = PipelineStatus.FAILURE;
          break;
        case JenkinsBuildResult.UNSTABLE:
          status = PipelineStatus.FAILURE; // Map unstable to failure
          break;
        case JenkinsBuildResult.ABORTED:
          status = PipelineStatus.FAILURE; // Map aborted to failure
          break;
        case JenkinsBuildResult.NOT_BUILT:
          status = PipelineStatus.PENDING;
          break;
        default:
          status = PipelineStatus.UNKNOWN;
      }
    }

    // Create a results string from build actions
    const results = JSON.stringify(build.actions || {});

    // Create and return a Pipeline object
    return Pipeline.createJenkinsPipeline(
      jobName,
      build.number,
      status,
      repositoryName,
      logs,
      results,
      build.url,
      sha
    );
  }

  private async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-jenkins-integration', 'tssc');
    if (!secret) {
      throw new Error('Jenkins secret not found in the cluster. Please ensure the secret exists.');
    }
    this.secret = secret;
    return secret;
  }

  public getbaseUrl(): string {
    if (!this.secret.baseUrl) {
      throw new Error('Jenkins base URL not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.baseUrl;
  }

  public getUsername(): string {
    if (!this.secret.username) {
      throw new Error('Jenkins username not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.username;
  }

  public getToken(): string {
    if (!this.secret.token) {
      throw new Error('Jenkins token not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.token;
  }
  /**
   * Initialize the Jenkins client by retrieving credentials from a Kubernetes secret
   * 1. create a folder with the repo name
   * 2. create 2 job with the names of source repo and gitops repo
   * 3. create secrets under the folder
   */
  public async initialize(): Promise<void> {
    try {
      await this.initJenkinsClient();
      console.log('Jenkins client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Jenkins client:', error);
      throw error;
    }
  }

  /**
   * Create a folder in Jenkins
   * @param folderName The name of the folder to create
   */
  public async createFolder(folderName: string): Promise<void> {
    try {
      // Create a folder in Jenkins
      const folderConfig = {
        name: folderName,
        description: `Folder for ${folderName}`,
      };
      await this.jenkinsClient.jobs.createFolder(folderConfig);
      console.log(`Folder ${folderName} created successfully`);
    } catch (error) {
      console.error(`Failed to create folder ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Create a job in Jenkins
   * @param jobName The name of the job to create
   * @param folderName The name of the folder to create the job in
   * @param repoUrl The URL of the repository for the job
   */
  public async createJob(jobName: string, folderName: string, repoUrl: string): Promise<void> {
    try {
      // Create a job in Jenkins
      await this.jenkinsClient.jobs.createJob({ jobName, repoUrl, folderName });
      console.log(`Job ${jobName} created successfully in folder ${folderName}`);
    } catch (error) {
      console.error(`Failed to create job ${jobName} in folder ${folderName}:`, error);
      throw error;
    }
  }

  public async addCredential(
    folderName: string,
    key: string,
    value: string,
    credentialType: CredentialType = CredentialType.SECRET_TEXT
  ): Promise<void> {
    try {
      // Check if credential already exists
      const credentialExists = await this.jenkinsClient.credentials.credentialExists(folderName, key);
      
      if (credentialExists) {
        console.log(`Credential ${key} already exists in folder ${folderName}. Updating...`);
        await this.jenkinsClient.credentials.updateCredential(folderName, key, value, credentialType);
      } else {
        console.log(`Creating new credential ${key} in folder ${folderName}...`);
        await this.jenkinsClient.credentials.createCredential(folderName, key, value, credentialType);
      }

      // Verify the credential was created/updated successfully
      const credential = await this.jenkinsClient.credentials.getCredential(folderName, key);
      if (!credential) {
        throw new Error(`Failed to verify credential ${key} after creation/update`);
      }

      console.log(`Credential ${key} successfully added/updated in folder ${folderName}`);
    } catch (error) {
      console.error(`Failed to apply credentials in folder ${folderName}:`, error);
      throw error;
    }
  }

  /**
   * Init the Jenkins client by retrieving credentials from a Kubernetes secret
   * 1. create a folder with the repo name
   * 2. create 2 job with the names of source repo and gitops repo
   * 3. create secrets under the folder
   */
  private async initJenkinsClient(): Promise<void> {
    try {
      await this.loadSecret();
      // Initialize the Jenkins client with credentials from the secret
      this.jenkinsClient = new JenkinsClient({
        baseUrl: this.getbaseUrl(),
        username: this.getUsername(),
        token: this.getToken(),
      });

      console.log('Jenkins client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Jenkins client:', error);
      throw error;
    }
  }

  /**
   * Get a pipeline for a given pull request
   * For Jenkins, we need to find the job specifically for the pullRequest's commit SHA
   * @param pullRequest The pull request to get the pipeline for
   * @param pipelineStatus The status of the pipeline to filter by
   * @param eventType The type of event that triggered the pipeline
   * @returns Pipeline object or null if no matching pipeline is found
   */
  public override async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    const jobName = pullRequest.repository;
    const folderName = this.componentName;
    const commitSha = pullRequest.sha;

    console.log(
      `Searching for Jenkins pipeline in job ${jobName} with commit SHA ${commitSha} in folder ${folderName}`
    );

    // Define the pipeline retrieval operation that will be retried
    const findPipelineOperation = async (): Promise<Pipeline | null> => {
      try {
        // Use getBuildByCommitSha to find the specific build for this commit
        const buildInfo = await this.jenkinsClient.builds.getBuildByCommitSha({
          jobName,
          commitSha,
          folderName,
        });

        if (!buildInfo) {
          console.log(`No build found for job ${jobName} with commit SHA ${commitSha}`);
          return null;
        }

        const buildNumber = buildInfo.number;

        // Map Jenkins build status to our standardized PipelineStatus format
        let status = PipelineStatus.UNKNOWN;

        if (buildInfo.building) {
          status = PipelineStatus.RUNNING;
        } else if (buildInfo.result) {
          switch (buildInfo.result.toUpperCase()) {
            case 'SUCCESS':
              status = PipelineStatus.SUCCESS;
              break;
            case 'FAILURE':
              status = PipelineStatus.FAILURE;
              break;
            case 'UNSTABLE':
              status = PipelineStatus.FAILURE; // Map unstable to failure
              break;
            case 'ABORTED':
              status = PipelineStatus.FAILURE; // Map aborted to failure
              break;
            case 'NOT_BUILT':
              status = PipelineStatus.PENDING;
              break;
            default:
              status = PipelineStatus.UNKNOWN;
          }
        }

        // If we're filtering by status and this pipeline doesn't match, return null
        if (pipelineStatus !== PipelineStatus.UNKNOWN && status !== pipelineStatus) {
          return null;
        }

        // If eventType is specified, get the build trigger type and check if it matches
        if (eventType) {
          // Get full build information with trigger detection enabled
          const buildWithTriggerInfo = await this.jenkinsClient.builds.getBuild(
            jobName,
            buildNumber,
            folderName,
          );

          // Check if the trigger type matches the requested event type
          if (buildWithTriggerInfo.triggerType) {
            const isPR = buildWithTriggerInfo.triggerType === JenkinsBuildTrigger.PULL_REQUEST;
            const isPush = buildWithTriggerInfo.triggerType === JenkinsBuildTrigger.PUSH;

            // Determine if we should filter this build based on event type
            if (
              (eventType === EventType.PULL_REQUEST && !isPR) ||
              (eventType === EventType.PUSH && !isPush)
            ) {
              console.log(
                `Build trigger type ${buildWithTriggerInfo.triggerType} doesn't match requested event type ${eventType}`
              );
              return null;
            }
          }
        }

        // Use the helper method to convert JenkinsBuild to Pipeline
        return this.convertBuildToPipeline(
          buildInfo,
          jobName,
          pullRequest.repository,
          commitSha
        );
      } catch (error) {
        console.error(`Error fetching Jenkins pipeline for commit SHA ${commitSha}:`, error);
        return null;
      }
    };

    // Execute the operation with retries when searching for pipelines with specific status
    if (pipelineStatus !== PipelineStatus.UNKNOWN) {
      const maxRetries = JenkinsCI.MAX_RETRIES;
      try {
        return await retry(
          async (): Promise<Pipeline> => {
            const pipeline = await findPipelineOperation();

            // If no matching pipeline found, trigger retry
            if (!pipeline) {
              throw new Error(
                `Waiting for pipeline in job ${jobName} with status ${pipelineStatus}`
              );
            }

            return pipeline;
          },
          {
            retries: maxRetries,
            minTimeout: JenkinsCI.MIN_TIMEOUT,
            maxTimeout: JenkinsCI.MAX_TIMEOUT,
            factor: JenkinsCI.BACKOFF_FACTOR,
            onRetry: (error: Error, attemptNumber) => {
              console.log(
                `[JENKINS-RETRY ${attemptNumber}/${maxRetries}] 🔄 Job: ${jobName} | SHA: ${commitSha} | Status: ${pipelineStatus} | Reason: ${error.message}`
              );
            },
          }
        );
      } catch (error: any) {
        console.log(
          `No matching pipeline found after retries for job ${jobName} with commit SHA ${commitSha} and status ${pipelineStatus}`
        );
        return null;
      }
    } else {
      // If not filtering by a specific status, just try once without retries
      return await findPipelineOperation();
    }
  }

  /**
   * Check the status of a Jenkins pipeline
   * Uses retry logic for resilience against transient network issues
   */
  protected override async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline.jobName || pipeline.buildNumber === undefined) {
      throw new Error('Job name and build number are required for Jenkins pipelines');
    }
  
    const jobName = pipeline.jobName;
    const folderName = this.componentName;
    const buildNumber = pipeline.buildNumber;
  
    try {
      // Use async-retry to get build status with resilience against transient failures
      const maxRetries = JenkinsCI.MAX_RETRIES;
  
      return await retry(
        async (): Promise<PipelineStatus> => {
          try {
            // Fix: Add the missing folderName parameter
            const buildInfo = await this.jenkinsClient.builds.getBuild(jobName, buildNumber, folderName);
  
            if (!buildInfo) {
              console.log(`Build info for ${jobName} #${buildNumber} not found`);
              return PipelineStatus.UNKNOWN;
            }
  
            // Convert the JenkinsBuild to a Pipeline and get its status
            const convertedPipeline = this.convertBuildToPipeline(
              buildInfo,
              jobName,
              pipeline.repositoryName
            );
  
            return convertedPipeline.status;
          } catch (error) {
            // If there's an error, throw it to trigger retry
            throw new Error(`Error checking build status: ${error}`);
          }
        },
        {
          retries: maxRetries,
          minTimeout: JenkinsCI.MIN_TIMEOUT,
          maxTimeout: JenkinsCI.MAX_TIMEOUT,
          factor: JenkinsCI.BACKOFF_FACTOR,
          onRetry: (error: Error, attemptNumber) => {
            console.log(
              `[JENKINS-RETRY ${attemptNumber}/${maxRetries}] 🔄 Checking status of ${jobName} #${buildNumber} | Reason: ${error.message}`
            );
          },
        }
      );
    } catch (error) {
      console.error(
        `Failed to check Jenkins build status for ${jobName} #${buildNumber} after multiple retries:`,
        error
      );
      return PipelineStatus.UNKNOWN;
    }
  }



  /**
   * Enhanced method to wait for all Jenkins jobs to finish (both running and queued)
   */
  public override async waitForAllPipelineRunsToFinish(timeoutMs: number = 600000, pollIntervalMs: number = 5000): Promise<void> {
    const folderName = this.componentName;
    const sourceRepoJobName = this.componentName;
    const gitopsRepoJobName = `${this.componentName}-gitops`;
    
    console.log(`Waiting for all Jenkins jobs to finish in folder ${folderName} for both source (${sourceRepoJobName}) and gitops (${gitopsRepoJobName}) repositories`);

    try {
      // Use the enhanced Jenkins client method to wait for multiple jobs
      await this.jenkinsClient.builds.waitForMultipleJobsToComplete({
        jobNames: [sourceRepoJobName, gitopsRepoJobName],
        folderName: folderName,
        timeoutMs: timeoutMs,
        pollIntervalMs: pollIntervalMs
      });
      
      console.log(`All Jenkins jobs have completed successfully in folder ${folderName}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Timeout')) {
        throw new Error(`Timeout waiting for Jenkins pipelines to finish in folder ${folderName} for both source and gitops repositories after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Get detailed activity status for all jobs in this component
   */
  public async getJobsActivityStatus(): Promise<JobActivityStatus[]> {
    const folderName = this.componentName;
    const sourceRepoJobName = this.componentName;
    const gitopsRepoJobName = `${this.componentName}-gitops`;

    try {
      return await this.jenkinsClient.builds.getMultipleJobsActivityStatus(
        [sourceRepoJobName, gitopsRepoJobName],
        folderName
      );
    } catch (error) {
      console.error(`Failed to get jobs activity status:`, error);
      throw error;
    }
  }

  public override async getWebhookUrl(): Promise<string> {
    const webhookUrl = `${this.getbaseUrl()}/github-webhook/`;
    return webhookUrl;
  }

  public override async getIntegrationSecret(): Promise<Record<string, string>> {
    if (this.secret) {
      return this.secret;
    }
    // Load the secret from the provider-specific implementation
    this.secret = await this.loadSecret();
    return this.secret;
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return 'Jenkinsfile';
  }

  /**
   * Get logs for a Jenkins pipeline build
   * @param pipeline The pipeline to get logs for
   * @returns Promise<string> The logs for the pipeline build
   * @throws Error if the pipeline doesn't have required identifiers or if log retrieval fails
   */
  public async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    if (!pipeline.jobName || pipeline.buildNumber === undefined) {
      throw new Error('Job name and build number are required for Jenkins pipelines');
    }

    try {
      const folderName = this.componentName;
      const logs = await this.jenkinsClient.builds.getBuildLog(
        pipeline.jobName,
        pipeline.buildNumber,
        folderName
      );

      if (!logs) {
        throw new Error(`No logs found for pipeline: ${pipeline.jobName} #${pipeline.buildNumber}`);
      }

      return logs;
    } catch (error) {
      console.error(
        `Error getting pipeline logs for ${pipeline.jobName} #${pipeline.buildNumber}:`,
        error
      );
      throw new Error(`Failed to get pipeline logs: ${error}`);
    }
  }

  /**
   * Trigger a Jenkins pipeline for a specific repository
   * @param repoName The name of the repository to trigger the pipeline for
   * @returns 
   */
  public async triggerPipeline(
    repoName: string,
  ): Promise<Pipeline | null> {
    if (!this.jenkinsClient) {
      throw new Error('Jenkins client is not initialized. Please call initialize() first.');
    }

    try {
      console.log(`Triggering Jenkins pipeline for job ${repoName}...`);
      await this.jenkinsClient.builds.triggerBuild({ jobName: repoName, folderName: this.componentName });
      const builds = await this.jenkinsClient.builds.getRunningBuilds(
            repoName,
            this.componentName
      );
      if (builds.length === 0) {
        console.log(`No builds found for job ${repoName} after triggering.`);
        return null;
      }
      // Get the most recent build
      const runningBuild = builds[0];
      const pipeline = this.convertBuildToPipeline(
        runningBuild,
        repoName,
        this.componentName
      );
      console.log(`Pipeline triggered successfully for job ${repoName}. Build number: ${pipeline.buildNumber}`);
      return pipeline;

    } catch (error) {
      console.error(`Failed to trigger Jenkins pipeline for job ${repoName}:`, error);
      throw error;
    }
  }

  /**
   * Cancel all pipelines for this component with optional filtering
   */
  public override async cancelAllPipelines(
    options?: CancelPipelineOptions
  ): Promise<CancelResult> {
    // 1. Normalize options with defaults
    const opts = this.normalizeOptions(options);

    // 2. Initialize result object
    const result: MutableCancelResult = {
      total: 0,
      cancelled: 0,
      failed: 0,
      skipped: 0,
      details: [],
      errors: [],
    };

    console.log(`[Jenkins] Starting build cancellation for ${this.componentName}`);

    try {
      // 3. Fetch all builds from Jenkins API
      const allBuilds = await this.fetchAllBuilds();
      result.total = allBuilds.length;

      if (allBuilds.length === 0) {
        console.log(`[Jenkins] No builds found for ${this.componentName}`);
        return result;
      }

      console.log(`[Jenkins] Found ${allBuilds.length} total builds`);

      // 4. Apply filters
      const buildsToCancel = this.filterBuilds(allBuilds, opts);

      console.log(`[Jenkins] ${buildsToCancel.length} builds match filters`);
      console.log(`[Jenkins] ${allBuilds.length - buildsToCancel.length} builds filtered out`);

      // 5. Cancel builds in batches
      await this.cancelBuildsInBatches(buildsToCancel, opts, result);

      // 6. Validate result counts (accounting invariant)
      const accounted = result.cancelled + result.failed + result.skipped;
      if (accounted !== result.total) {
        const missing = result.total - accounted;
        console.error(
          `❌ [Jenkins] ACCOUNTING ERROR: ${missing} builds unaccounted for ` +
          `(total: ${result.total}, accounted: ${accounted})`
        );

        // Add accounting error to errors array
        result.errors.push({
          pipelineId: 'ACCOUNTING_ERROR',
          message: `${missing} builds lost in processing`,
          error: new Error('Result count mismatch - this indicates a bug in the cancellation logic'),
        });
      }

      // 7. Log summary
      console.log(`[Jenkins] Cancellation complete:`, {
        total: result.total,
        cancelled: result.cancelled,
        failed: result.failed,
        skipped: result.skipped,
      });

    } catch (error: any) {
      console.error(`[Jenkins] Error in cancelAllPipelines: ${error.message}`);
      throw new Error(`Failed to cancel pipelines: ${error.message}`);
    }

    return result;
  }



  /**
   * Fetch all builds from Jenkins API (both source and gitops jobs)
   */
  private async fetchAllBuilds(): Promise<any[]> {
    try {
      const allBuilds: any[] = [];
      const folderName = this.componentName;

      // Fetch builds from source job (errors should propagate for main job)
      const sourceJobName = this.componentName;
      const sourceBuilds = await this.jenkinsClient.builds.getRunningBuilds(sourceJobName, folderName);

      // Tag builds with their job name for later cancellation
      const taggedSourceBuilds = (sourceBuilds || []).map(build => ({
        ...build,
        _jobName: sourceJobName
      }));
      allBuilds.push(...taggedSourceBuilds);

      // Fetch builds from gitops job
      const gitopsJobName = `${this.componentName}-gitops`;
      try {
        const gitopsBuilds = await this.jenkinsClient.builds.getRunningBuilds(gitopsJobName, folderName);

        // Tag builds with their job name for later cancellation
        const taggedGitopsBuilds = (gitopsBuilds || []).map(build => ({
          ...build,
          _jobName: gitopsJobName
        }));
        allBuilds.push(...taggedGitopsBuilds);
      } catch (gitopsError: any) {
        // Gitops job might not exist, log but don't fail
        console.log(`[Jenkins] Gitops job ${gitopsJobName} not found or no builds: ${gitopsError.message}`);
      }

      return allBuilds;

    } catch (error: any) {
      console.error(`[Jenkins] Failed to fetch builds: ${error.message}`);
      throw error;
    }
  }

  /**
   * Filter builds based on cancellation options
   */
  private filterBuilds(
    builds: any[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>
  ): any[] {
    return builds.filter(build => {
      // Filter 1: Skip completed builds unless includeCompleted is true
      if (!options.includeCompleted && this.isCompletedStatus(build)) {
        console.log(`[Filter] Skipping completed build ${build.number} (${build.result})`);
        return false;
      }

      // Filter 2: Check exclusion patterns
      if (this.matchesExclusionPattern(build, options.excludePatterns)) {
        console.log(`[Filter] Excluding build ${build.number} by pattern`);
        return false;
      }

      // Filter 3: Filter by event type if specified
      if (options.eventType && !this.matchesEventType(build, options.eventType)) {
        console.log(`[Filter] Skipping build ${build.number} (event type mismatch)`);
        return false;
      }

      // Note: Jenkins builds don't have direct branch information in getRunningBuilds
      // Branch filtering would require fetching full build details, skipping for performance
      if (options.branch) {
        console.log(`[Filter] Branch filtering not supported for Jenkins running builds, ignoring branch filter`);
      }

      return true; // Include this build for cancellation
    });
  }

  /**
   * Check if build status is completed
   */
  private isCompletedStatus(build: any): boolean {
    // If building is true, it's not completed
    if (build.building) {
      return false;
    }

    // If we have a result, the build is completed
    return build.result !== null && build.result !== undefined;
  }

  /**
   * Check if build matches any exclusion pattern
   */
  private matchesExclusionPattern(build: any, patterns: ReadonlyArray<RegExp>): boolean {
    if (patterns.length === 0) {
      return false;
    }

    const buildName = build.displayName || `Build-${build.number}`;

    return patterns.some(pattern => pattern.test(buildName));
  }

  /**
   * Check if build matches the event type
   * Jenkins uses trigger type to indicate event type
   */
  private matchesEventType(build: any, eventType: EventType): boolean {
    // If we have trigger type information from the build
    if (build.triggerType) {
      switch (eventType) {
        case EventType.PUSH:
          return build.triggerType === JenkinsBuildTrigger.PUSH;
        case EventType.PULL_REQUEST:
          return build.triggerType === JenkinsBuildTrigger.PULL_REQUEST;
        default:
          return false;
      }
    }

    // If no trigger type info, allow all (can't filter)
    return true;
  }

  /**
   * Cancel builds in batches with concurrency control
   */
  private async cancelBuildsInBatches(
    builds: any[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Split into batches
    const batches = this.chunkArray(builds, options.concurrency);

    console.log(`[Jenkins] Processing ${batches.length} batches with concurrency ${options.concurrency}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[Jenkins] Processing batch ${i + 1}/${batches.length} (${batch.length} builds)`);

      // Create promises for all builds in this batch
      const promises = batch.map(build =>
        this.cancelSingleBuild(build, options, result)
      );

      // Wait for all in batch to complete (don't stop on errors)
      const batchResults = await Promise.allSettled(promises);

      // Inspect batch results for systemic failures
      const batchSuccesses = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailures = batchResults.filter(r => r.status === 'rejected').length;

      console.log(`[Jenkins] Batch ${i + 1}/${batches.length} complete: ${batchSuccesses} succeeded, ${batchFailures} rejected`);

      // Alert on complete batch failure - indicates systemic issue
      if (batchFailures === batch.length && batch.length > 0) {
        console.error(`❌ [Jenkins] ENTIRE BATCH ${i + 1} FAILED - possible systemic issue (auth, network, or API problem)`);

        // Log first rejection reason for debugging
        const firstRejected = batchResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstRejected) {
          console.error(`[Jenkins] First failure reason: ${firstRejected.reason}`);
        }
      }
    }
  }

  /**
   * Cancel a single build and update results
   */
  private async cancelSingleBuild(
    build: any,
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Initialize detail object
    const detail: MutablePipelineCancelDetail = {
      pipelineId: build.number,
      name: build.displayName || `Build-${build.number}`,
      status: build.building ? PipelineStatus.RUNNING : PipelineStatus.UNKNOWN,
      result: 'skipped',
      eventType: this.mapJenkinsEventType(build),
    };

    try {
      if (options.dryRun) {
        // Dry run mode - don't actually cancel
        detail.result = 'skipped';
        detail.reason = 'Dry run mode';
        result.skipped++;
        console.log(`[DryRun] Would cancel build ${build.number}`);

      } else {
        // Extract job name from tagged build (added in fetchAllBuilds)
        const jobName = (build as any)._jobName || this.componentName;

        // Actually cancel the build via Jenkins API
        await this.cancelBuildViaAPI(jobName, build.number);

        detail.result = 'cancelled';
        result.cancelled++;
        console.log(`✅ [Jenkins] Cancelled build ${jobName} #${build.number} (status: ${build.building ? 'building' : build.result})`);
      }

    } catch (error: any) {
      // Cancellation failed
      detail.result = 'failed';
      detail.reason = error.message;
      result.failed++;

      // Add to errors array
      const cancelError: MutableCancelError = {
        pipelineId: build.number,
        message: error.message,
        error: error,
      };

      result.errors.push(cancelError);

      console.error(`❌ [Jenkins] Failed to cancel build ${build.number}: ${error.message}`);
    }

    // Add detail to results
    result.details.push(detail);
  }

  /**
   * Actually cancel the build via Jenkins API
   */
  private async cancelBuildViaAPI(jobName: string, buildNumber: number): Promise<void> {
    try {
      const folderName = this.componentName;
      await this.jenkinsClient.builds.stopBuild(jobName, buildNumber, folderName);

    } catch (error: any) {
      // Re-throw - the jenkinsClient.builds.stopBuild already has error handling
      throw error;
    }
  }

  /**
   * Map Jenkins build to EventType
   */
  private mapJenkinsEventType(build: any): EventType | undefined {
    if (build.triggerType === JenkinsBuildTrigger.PUSH) {
      return EventType.PUSH;
    }
    if (build.triggerType === JenkinsBuildTrigger.PULL_REQUEST) {
      return EventType.PULL_REQUEST;
    }
    return undefined;
  }


}
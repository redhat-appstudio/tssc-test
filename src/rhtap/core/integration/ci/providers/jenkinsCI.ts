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
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';
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
      await this.jenkinsClient.createFolder(folderConfig);
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
      await this.jenkinsClient.createJob(jobName, repoUrl, folderName);
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
      const credentialExists = await this.jenkinsClient.credentialExists(folderName, key);
      
      if (credentialExists) {
        console.log(`Credential ${key} already exists in folder ${folderName}. Updating...`);
        await this.jenkinsClient.updateCredential(folderName, key, value, credentialType);
      } else {
        console.log(`Creating new credential ${key} in folder ${folderName}...`);
        await this.jenkinsClient.createCredential(folderName, key, value, credentialType);
      }

      // Verify the credential was created/updated successfully
      const credential = await this.jenkinsClient.getCredential(folderName, key);
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
        const buildInfo = await this.jenkinsClient.getBuildByCommitSha(
          jobName,
          commitSha,
          folderName
        );

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
          const buildWithTriggerInfo = await this.jenkinsClient.getBuild(
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
  protected override async checkPipelineStatus(pipeline: Pipeline): Promise<PipelineStatus> {
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
            const buildInfo = await this.jenkinsClient.getBuild(jobName, buildNumber, folderName);
  
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

  public override async cancelAllInitialPipelines(): Promise<void> {
    throw new Error(
      'Jenkins does not support cancelling initial pipeline runs.'
    );
  }

  /**
   * Enhanced method to wait for all Jenkins jobs to finish (both running and queued)
   */
  public override async waitForAllPipelinesToFinish(timeoutMs: number = 600000, pollIntervalMs: number = 5000): Promise<void> {
    const folderName = this.componentName;
    const sourceRepoJobName = this.componentName;
    const gitopsRepoJobName = `${this.componentName}-gitops`;
    
    console.log(`Waiting for all Jenkins jobs to finish in folder ${folderName} for both source (${sourceRepoJobName}) and gitops (${gitopsRepoJobName}) repositories`);

    try {
      // Use the enhanced Jenkins client method to wait for multiple jobs
      await this.jenkinsClient.waitForMultipleJobsToComplete({
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
      return await this.jenkinsClient.getMultipleJobsActivityStatus(
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
      const logs = await this.jenkinsClient.getBuildLog(
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
      await this.jenkinsClient.build(repoName, this.componentName);
      const builds = await this.jenkinsClient.getRunningBuilds(
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
}
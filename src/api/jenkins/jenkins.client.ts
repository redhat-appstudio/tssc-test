import { JenkinsHttpClient } from './http/jenkins-http.client';
import { JenkinsJobService } from './services/jenkins-job.service';
import { JenkinsBuildService } from './services/jenkins-build.service';
import { JenkinsCredentialService } from './services/jenkins-credential.service';
import { 
  JenkinsClientConfig,
  JenkinsApiResponse,
  FolderConfig,
  CreateJobOptions,
  BuildOptions,
  BuildSearchOptions,
  WaitForBuildOptions,
  JenkinsBuild,
  JenkinsJob,
  JobActivityStatus,
  WaitForJobsOptions
} from './types/jenkins.types';
import { CredentialType, JenkinsBuildTrigger } from './enums/jenkins.enums';

/**
 * Main Jenkins client that provides a facade over the service-oriented architecture
 * This class maintains backwards compatibility while providing access to the new structured services
 */
export class JenkinsClient {
  private httpClient: JenkinsHttpClient;
  private jobService: JenkinsJobService;
  private buildService: JenkinsBuildService;
  private credentialService: JenkinsCredentialService;

  constructor(config: JenkinsClientConfig) {
    this.httpClient = new JenkinsHttpClient(config);
    this.jobService = new JenkinsJobService(this.httpClient);
    this.buildService = new JenkinsBuildService(this.httpClient);
    this.credentialService = new JenkinsCredentialService(this.httpClient);
  }

  // ===========================================
  // FOLDER OPERATIONS
  // ===========================================

  /**
   * Create a folder in Jenkins
   */
  async createFolder(folderConfig: FolderConfig): Promise<JenkinsApiResponse> {
    return this.jobService.createFolder(folderConfig);
  }

  // ===========================================
  // JOB OPERATIONS
  // ===========================================

  /**
   * Create a job in Jenkins
   */
  async createJob(options: CreateJobOptions): Promise<JenkinsApiResponse>;
  async createJob(
    jobName: string,
    repoUrl: string,
    folderName?: string,
    branch?: string,
    jenkinsfilePath?: string,
    credentialId?: string
  ): Promise<JenkinsApiResponse>;
  async createJob(
    optionsOrJobName: CreateJobOptions | string,
    repoUrl?: string,
    folderName?: string,
    branch?: string,
    jenkinsfilePath?: string,
    credentialId?: string
  ): Promise<JenkinsApiResponse> {
    if (typeof optionsOrJobName === 'string') {
      // Legacy method signature
      const options: CreateJobOptions = {
        jobName: optionsOrJobName,
        repoUrl: repoUrl!,
        folderName,
        branch,
        jenkinsfilePath,
        credentialId,
      };
      return this.jobService.createJob(options);
    } else {
      // New options object signature
      return this.jobService.createJob(optionsOrJobName);
    }
  }

  /**
   * Get information about a job
   */
  async getJob(jobPath: string): Promise<JenkinsJob> {
    return this.jobService.getJob(jobPath);
  }

  /**
   * Delete a job
   */
  async deleteJob(jobName: string, folderName?: string): Promise<JenkinsApiResponse> {
    return this.jobService.deleteJob(jobName, folderName);
  }

  /**
   * Check if a job exists
   */
  async jobExists(jobName: string, folderName?: string): Promise<boolean> {
    return this.jobService.jobExists(jobName, folderName);
  }

  /**
   * Get all jobs in a folder
   */
  async getJobs(folderName?: string): Promise<JenkinsJob[]> {
    return this.jobService.getJobs(folderName);
  }

  /**
   * Enable a job
   */
  async enableJob(jobName: string, folderName?: string): Promise<JenkinsApiResponse> {
    return this.jobService.enableJob(jobName, folderName);
  }

  /**
   * Disable a job
   */
  async disableJob(jobName: string, folderName?: string): Promise<JenkinsApiResponse> {
    return this.jobService.disableJob(jobName, folderName);
  }

  // ===========================================
  // CREDENTIAL OPERATIONS
  // ===========================================

  /**
   * Create a credential in Jenkins
   */
  async createCredential(
    folderName: string,
    credentialId: string,
    secretValue: string,
    credentialType: CredentialType = CredentialType.SECRET_TEXT
  ): Promise<JenkinsApiResponse> {
    return this.credentialService.createCredential(folderName, credentialId, secretValue, credentialType);
  }

  /**
   * Create secret text credential (convenience method)
   */
  async createSecretTextCredential(
    folderName: string,
    credentialId: string,
    secretValue: string
  ): Promise<JenkinsApiResponse> {
    return this.credentialService.createSecretTextCredential(folderName, credentialId, secretValue);
  }

  /**
   * Create username/password credential (convenience method)
   */
  async createUsernamePasswordCredential(
    folderName: string,
    credentialId: string,
    username: string,
    password: string
  ): Promise<JenkinsApiResponse> {
    return this.credentialService.createUsernamePasswordCredential(folderName, credentialId, username, password);
  }

  /**
   * Get credential information (without sensitive data)
   */
  async getCredential(folderName: string, credentialId: string): Promise<any> {
    return this.credentialService.getCredential(folderName, credentialId);
  }

  /**
   * Check if a credential exists
   */
  async credentialExists(folderName: string, credentialId: string): Promise<boolean> {
    return this.credentialService.credentialExists(folderName, credentialId);
  }

  /**
   * Update an existing credential
   */
  async updateCredential(
    folderName: string,
    credentialId: string,
    secretValue: string,
    credentialType: CredentialType = CredentialType.SECRET_TEXT
  ): Promise<JenkinsApiResponse> {
    return this.credentialService.updateCredential(folderName, credentialId, secretValue, credentialType);
  }

  /**
   * Delete a credential
   */
  async deleteCredential(folderName: string, credentialId: string): Promise<JenkinsApiResponse> {
    return this.credentialService.deleteCredential(folderName, credentialId);
  }

  /**
   * List all credentials in a domain
   */
  async listCredentials(folderName?: string): Promise<any[]> {
    return this.credentialService.listCredentials(folderName);
  }

  /**
   * Create SSH private key credential (convenience method)
   */
  async createSshPrivateKeyCredential(
    folderName: string,
    credentialId: string,
    username: string,
    privateKey: string,
    passphrase?: string
  ): Promise<JenkinsApiResponse> {
    return this.credentialService.createSshPrivateKeyCredential(folderName, credentialId, username, privateKey, passphrase);
  }

  // ===========================================
  // BUILD OPERATIONS
  // ===========================================

  /**
   * Trigger a build for a job
   */
  async build(options: BuildOptions): Promise<JenkinsApiResponse>;
  async build(
    jobName: string,
    folderName?: string,
    parameters?: Record<string, string>
  ): Promise<JenkinsApiResponse>;
  async build(
    optionsOrJobName: BuildOptions | string,
    folderName?: string,
    parameters?: Record<string, string>
  ): Promise<JenkinsApiResponse> {
    if (typeof optionsOrJobName === 'string') {
      // Legacy method signature
      const options: BuildOptions = {
        jobName: optionsOrJobName,
        folderName,
        parameters,
      };
      return this.buildService.triggerBuild(options);
    } else {
      // New options object signature
      return this.buildService.triggerBuild(optionsOrJobName);
    }
  }

  /**
   * Get information about a build
   */
  async getBuild(
    jobName: string,
    buildNumber: number,
    folderName?: string,
    includeTriggerInfo: boolean = false
  ): Promise<JenkinsBuild> {
    return this.buildService.getBuild(jobName, buildNumber, folderName, includeTriggerInfo);
  }

  /**
   * Get all currently running builds for a job
   */
  async getRunningBuilds(jobName: string, folderName?: string): Promise<JenkinsBuild[]> {
    return this.buildService.getRunningBuilds(jobName, folderName);
  }

  /**
   * Get the latest build for a job
   */
  async getLatestBuild(jobName: string, folderName?: string): Promise<JenkinsBuild | null> {
    return this.buildService.getLatestBuild(jobName, folderName);
  }

  /**
   * Get the console log for a build
   */
  async getBuildLog(jobName: string, buildNumber: number, folderName?: string): Promise<string> {
    return this.buildService.getBuildLog(jobName, buildNumber, folderName);
  }

  /**
   * Wait for a build to complete with timeout
   */
  async waitForBuildCompletion(options: WaitForBuildOptions): Promise<JenkinsBuild>;
  async waitForBuildCompletion(
    jobName: string,
    buildNumber: number,
    folderName?: string,
    timeoutMs?: number,
    pollIntervalMs?: number
  ): Promise<JenkinsBuild>;
  async waitForBuildCompletion(
    optionsOrJobName: WaitForBuildOptions | string,
    buildNumber?: number,
    folderName?: string,
    timeoutMs?: number,
    pollIntervalMs?: number
  ): Promise<JenkinsBuild> {
    if (typeof optionsOrJobName === 'string') {
      // Legacy method signature
      const options: WaitForBuildOptions = {
        jobName: optionsOrJobName,
        buildNumber: buildNumber!,
        folderName,
        timeoutMs,
        pollIntervalMs,
      };
      return this.buildService.waitForBuildCompletion(options);
    } else {
      // New options object signature
      return this.buildService.waitForBuildCompletion(optionsOrJobName);
    }
  }

  /**
   * Get the build associated with a specific git commit SHA
   */
  async getBuildByCommitSha(options: BuildSearchOptions): Promise<JenkinsBuild | null>;
  async getBuildByCommitSha(
    jobName: string,
    commitSha: string,
    folderName?: string,
    maxBuildsToCheck?: number
  ): Promise<JenkinsBuild | null>;
  async getBuildByCommitSha(
    optionsOrJobName: BuildSearchOptions | string,
    commitSha?: string,
    folderName?: string,
    maxBuildsToCheck?: number
  ): Promise<JenkinsBuild | null> {
    if (typeof optionsOrJobName === 'string') {
      // Legacy method signature
      const options: BuildSearchOptions = {
        jobName: optionsOrJobName,
        commitSha: commitSha!,
        folderName,
        maxBuildsToCheck,
      };
      return this.buildService.getBuildByCommitSha(options);
    } else {
      // New options object signature
      return this.buildService.getBuildByCommitSha(optionsOrJobName);
    }
  }

  /**
   * Get the trigger type of a build
   */
  async getBuildTriggerType(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<JenkinsBuildTrigger> {
    return this.buildService.getBuildTriggerType(jobName, buildNumber, folderName);
  }

  /**
   * Check if a build was triggered by a pull request
   */
  async isBuildTriggeredByPullRequest(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<boolean> {
    return this.buildService.isBuildTriggeredByPullRequest(jobName, buildNumber, folderName);
  }

  /**
   * Check if a build was triggered by a push event
   */
  async isBuildTriggeredByPush(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<boolean> {
    return this.buildService.isBuildTriggeredByPush(jobName, buildNumber, folderName);
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Check if Jenkins server is reachable
   */
  async ping(): Promise<boolean> {
    return this.httpClient.ping();
  }

  /**
   * Get Jenkins version
   */
  async getVersion(): Promise<string | null> {
    return this.httpClient.getVersion();
  }

  // ===========================================
  // SERVICE ACCESS (for advanced usage)
  // ===========================================

  /**
   * Get comprehensive activity status for a job (running builds + queue status)
   */
  async getJobActivityStatus(jobName: string, folderName?: string): Promise<JobActivityStatus> {
    return this.buildService.getJobActivityStatus(jobName, folderName);
  }

  /**
   * Get activity status for multiple jobs
   */
  async getMultipleJobsActivityStatus(jobNames: string[], folderName?: string): Promise<JobActivityStatus[]> {
    return this.buildService.getMultipleJobsActivityStatus(jobNames, folderName);
  }

  /**
   * Wait for multiple jobs to complete (both running builds and queued jobs)
   */
  async waitForMultipleJobsToComplete(options: WaitForJobsOptions): Promise<void>;
  async waitForMultipleJobsToComplete(
    jobNames: string[], 
    folderName?: string, 
    timeoutMs?: number, 
    pollIntervalMs?: number
  ): Promise<void>;
  async waitForMultipleJobsToComplete(
    optionsOrJobNames: WaitForJobsOptions | string[],
    folderName?: string,
    timeoutMs?: number,
    pollIntervalMs?: number
  ): Promise<void> {
    if (Array.isArray(optionsOrJobNames)) {
      // Legacy method signature
      const options: WaitForJobsOptions = {
        jobNames: optionsOrJobNames,
        folderName,
        timeoutMs,
        pollIntervalMs,
      };
      return this.buildService.waitForMultipleJobsToComplete(options);
    } else {
      // New options object signature
      return this.buildService.waitForMultipleJobsToComplete(optionsOrJobNames);
    }
  }

  /**
   * Get the job service for advanced job operations
   */
  get jobs(): JenkinsJobService {
    return this.jobService;
  }

  /**
   * Get the build service for advanced build operations
   */
  get builds(): JenkinsBuildService {
    return this.buildService;
  }

  /**
   * Get the credential service for advanced credential operations
   */
  get credentials(): JenkinsCredentialService {
    return this.credentialService;
  }

  /**
   * Get the HTTP client for direct API access
   */
  get http(): JenkinsHttpClient {
    return this.httpClient;
  }
} 
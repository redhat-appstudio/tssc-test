import { CredentialType, JenkinsClient } from '../../../../../../src/api/ci/jenkinsClient';
import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { RetryOperationResult, retryOperation } from '../../../../../utils/util';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, Pipeline, PipelineStatus } from '../ciInterface';

export class JenkinsCI extends BaseCI {
  private jenkinsClient!: JenkinsClient;
  private componentName: string;
  // private sourceRepoName: string = '';
  // private gitOpsRepoName: string = '';
  private secret!: Record<string, string>;

  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.JENKINS, kubeClient);
    this.componentName = componentName;
    // this.sourceRepoName = this.componentName;
    // this.gitOpsRepoName = `${this.componentName}-gitops`;
  }

  private async loadSecret(): Promise<void> {
    const secret = await this.kubeClient.getSecret('rhtap-jenkins-integration', 'rhtap');
    if (!secret) {
      throw new Error('Jenkins secret not found in the cluster. Please ensure the secret exists.');
    }
    this.secret = secret;
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
      // // Create a folder with the repo name
      // const folderName = this.componentName;
      // await this.createFolder(folderName);
      // // Add credentials to the folder
      // // await this.applyCredential(this.componentName, this.componentName);
      // // Create 2 jobs with the names of source repo and gitops repo
      // const sourceRepoJobName = `${this.sourceRepoName}`;
      // const gitOpsRepoJobName = `${this.gitOpsRepoName}`;
      // await this.createJob(sourceRepoJobName, folderName, this.sourceRepoName);
      // await this.createJob(gitOpsRepoJobName, folderName, this.gitOpsRepoName);

      // console.log(`Jobs ${sourceRepoJobName} and ${gitOpsRepoJobName} created successfully`);
      console.log('Jenkins client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Jenkins client:', error);
      throw error;
    }
  }

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
      await this.jenkinsClient.createCredential(folderName, key, value, credentialType);
    } catch (error) {
      console.error(`Failed to apply credentials in folder ${folderName}:`, error);
      throw error;
    }
  }

  // private async addCredential(folderName: string, git: Git): Promise<void> {
  //   await this.jenkinsClient.createCredential(folderName, 'QUAY_IO_CREDS', 'fakeUsername');
  //   await this.jenkinsClient.createCredential(folderName, 'QUAY_IO_PASSWORD', 'fakePassword');

  //     try {
  //         if ( git.getGitType() == GitType.GITLAB) {
  //             const gitlab = git as GitlabProvider;
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_AUTH_USERNAME', 'fakeUsername');
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_AUTH_PASSWORD', gitlab.getToken());
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_CREDENTIALS', `fakeUsername:${gitlab.getToken()}`, CredentialType.USERNAME_PASSWORD);
  //         }else if (git.getGitType() == GitType.BITBUCKET) {
  //             const bitbucket = git as BitbucketProvider;
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_AUTH_USERNAME', bitbucket.getUsername());
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_AUTH_PASSWORD', bitbucket.getAppPassword());
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_CREDENTIALS', `${bitbucket.getUsername()}:${bitbucket.getAppPassword()}`, CredentialType.USERNAME_PASSWORD);
  //         }else {
  //             const github = git as GithubProvider;
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_AUTH_PASSWORD', github.getToken());
  //             await this.jenkinsClient.createCredential(folderName, 'GITOPS_CREDENTIALS', `fakeUsername:${github.getToken()}` , CredentialType.USERNAME_PASSWORD);
  //         }
  //         await this.jenkinsClient.createCredential(folderName, 'COSIGN_SECRET_KEY', 'CosignPrivateKey');
  //         await this.jenkinsClient.createCredential(folderName, 'COSIGN_SECRET_PASSWORD', 'CosignPrivateKeyPassword');
  //         await this.jenkinsClient.createCredential(folderName, 'IMAGE_REGISTRY_PASSWORD', process.env.IMAGE_REGISTRY_PASSWORD ?? '');
  //         await this.jenkinsClient.createCredential(folderName, 'ROX_API_TOKEN', '<ACS token>');
  //     }
  //     catch (error) {
  //         console.error(`Failed to create secret in folder ${folderName}:`, error);
  //         throw error;
  //     }
  // }
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
   * @returns Pipeline object or null if no matching pipeline is found
   */
  public async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus
  ): Promise<Pipeline | null> {
    // Input validation
    if (!pullRequest.repository) {
      console.error('Repository name is missing in the pull request');
      return null;
    }

    if (!pullRequest.sha) {
      console.error('Commit SHA is missing in the pull request');
      return null;
    }

    try {
      // In Jenkins, the job name should be the same as the repository name
      const jobName = pullRequest.repository;
      const folderName = this.componentName;

      console.log(
        `Searching for Jenkins pipeline in job ${jobName} with commit SHA ${pullRequest.sha}`
      );

      // Use getBuildByCommitSha to find the specific build for this commit
      const buildInfo = await this.jenkinsClient.getBuildByCommitSha(
        jobName,
        pullRequest.sha,
        folderName
      );

      if (!buildInfo) {
        console.log(`No build found for job ${jobName} with commit SHA ${pullRequest.sha}`);
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

      // Get build logs for more detailed information
      let logs = '';
      try {
        const logResponse = await this.jenkinsClient.getBuildLog(jobName, buildNumber, folderName);
        logs = logResponse.text;
      } catch (error) {
        console.warn('Could not retrieve build logs:', error);
      }

      // Get start and end time if available
      // const startTime = buildInfo.timestamp ? new Date(buildInfo.timestamp) : undefined;
      // const endTime = buildInfo.duration && startTime ? new Date(startTime.getTime() + buildInfo.duration) : undefined;

      // Create and return a Jenkins pipeline object with all relevant information
      return Pipeline.createJenkinsPipeline(
        jobName,
        buildNumber,
        status,
        pullRequest.repository,
        logs,
        JSON.stringify(buildInfo.actions || {}),
        buildInfo.url,
        pullRequest.sha
      );
    } catch (error) {
      console.error(`Error fetching Jenkins pipeline for commit SHA ${pullRequest.sha}:`, error);
      return null;
    }
  }

  /**
   * Check the status of a Jenkins pipeline
   */
  protected async checkPipelineStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline.jobName || pipeline.buildNumber === undefined) {
      throw new Error('Job name and build number are required for Jenkins pipelines');
    }

    try {
      const buildInfo = await this.jenkinsClient.getBuild(pipeline.jobName, pipeline.buildNumber);

      if (!buildInfo) {
        return PipelineStatus.UNKNOWN;
      }

      // Map Jenkins status to our format
      if (buildInfo.building) {
        return PipelineStatus.RUNNING;
      } else if (buildInfo.result) {
        switch (buildInfo.result.toUpperCase()) {
          case 'SUCCESS':
            return PipelineStatus.SUCCESS;
          case 'FAILURE':
            return PipelineStatus.FAILURE;
          case 'UNSTABLE':
            return PipelineStatus.FAILURE; // Map unstable to failure
          case 'ABORTED':
            return PipelineStatus.FAILURE; // Map aborted to failure
          case 'NOT_BUILT':
            return PipelineStatus.PENDING;
          default:
            return PipelineStatus.UNKNOWN;
        }
      }

      return PipelineStatus.UNKNOWN;
    } catch (error) {
      console.error(
        `Error checking Jenkins build status for ${pipeline.jobName} #${pipeline.buildNumber}:`,
        error
      );
      return PipelineStatus.UNKNOWN;
    }
  }

  /**
   * Wait for all Jenkins jobs to finish
   */
  public override async waitForAllPipelinesToFinish(): Promise<void> {
    try {
      // Get all jobs in the component folder
      const folderName = this.componentName;

      // Define the operation to get running builds
      const getRunningBuildsOperation = async (): Promise<RetryOperationResult<any[]>> => {
        try {
          const jobs = await this.jenkinsClient.getRunningBuilds(
            `${this.componentName}`,
            folderName
          );

          return {
            success: true,
            result: jobs || [],
          };
        } catch (error) {
          return {
            success: false,
            result: null,
            message: `Error getting running builds: ${error}`,
          };
        }
      };

      // Retry getting jobs for up to 10 seconds
      const jobs = await retryOperation(
        getRunningBuildsOperation,
        5, // try up to 5 times
        2000, // 2-second delay between retries (total ~10 seconds)
        `Jenkins jobs in folder ${folderName}`
      );

      if (!jobs || jobs.length === 0) {
        console.log('No Jenkins jobs found after retrying');
        return;
      }

      console.log(`Found ${jobs.length} Jenkins jobs`);

      // Check all jobs for running builds
      for (const job of jobs) {
        if (!job.lastBuild) continue;

        const buildInfo = await this.jenkinsClient.getBuild(job.name, job.lastBuild.number);

        if (buildInfo?.building) {
          // Create a pipeline object for the running build
          const pipeline = Pipeline.createJenkinsPipeline(
            job.name,
            job.lastBuild.number,
            PipelineStatus.RUNNING,
            job.name, // Using job name as repository name
            '',
            ''
          );

          // Wait for this pipeline to finish
          await this.waitForPipelineToFinish(pipeline);
        }
      }
    } catch (error) {
      console.error('Error waiting for Jenkins builds to finish:', error);
    }
  }

  public async getWebhookUrl(): Promise<string> {
    // Jenkins does not have a standard webhook URL like GitHub or GitLab
    // You may need to implement a custom webhook handler in your Jenkins instance
    // and return the URL here.
    throw new Error('Jenkins does not support webhooks in the same way as other CI systems.');
  }
}

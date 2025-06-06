import axios, { AxiosInstance } from 'axios';
import retry from 'async-retry';
/**
 * Jenkins build result status enum
 */
export enum JenkinsBuildResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  UNSTABLE = 'UNSTABLE',
  ABORTED = 'ABORTED',
  NOT_BUILT = 'NOT_BUILT',
}

/**
 * Jenkins build trigger type enum
 */
export enum JenkinsBuildTrigger {
  UNKNOWN = 'UNKNOWN',
  PULL_REQUEST = 'PULL_REQUEST',
  PUSH = 'PUSH',
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
  API = 'API',
}

/**
 * Basic interface for Jenkins build information
 */
export interface JenkinsBuild {
  id: string; // Unique build identifier
  number: number; // Build number
  url: string; // URL to the build in Jenkins
  displayName: string; // Display name of the build
  fullDisplayName?: string; // Full display name (job name + build number)

  // Status
  building: boolean; // Whether the build is currently running
  result: JenkinsBuildResult | null; // Build result (null if building)

  // Timing
  timestamp: number; // Build start time (milliseconds since epoch)
  duration: number; // Build duration in milliseconds

  // Build details
  actions: any[]; // Actions related to the build (contains SCM info, etc.)
  causes?: Array<{
    // The causes that triggered the build
    shortDescription: string;
    [key: string]: any;
  }>;

  // Trigger information
  triggerType?: JenkinsBuildTrigger; // The type of event that triggered this build

  // Additional useful properties
  description?: string; // Build description
  artifacts?: Array<{
    // Build artifacts
    displayPath: string;
    fileName: string;
    relativePath: string;
  }>;
}

export enum CredentialType {
  SECRET_TEXT = 'Secret text',
  USERNAME_PASSWORD = 'Username with password',
}

interface JenkinsClientConfig {
  baseUrl: string;
  username: string;
  token: string;
}

interface FolderConfig {
  name: string;
  description?: string;
}

function parseQueueId(location: string): number {
  const arr = location.split('/').filter(Boolean);
  return +arr[arr.length - 1];
}

export class JenkinsClient {
  private client: AxiosInstance;

  constructor(config: JenkinsClientConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      auth: {
        username: config.username,
        password: config.token,
      },
      headers: {
        'Content-Type': 'application/xml',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Get information about a job
   * @param jobPath The path to the job (can include folders, e.g., "folder/job")
   */
  public async getJob(jobPath: string): Promise<any> {
    try {
      const formattedPath = jobPath
        .split('/')
        .map(segment => `job/${encodeURIComponent(segment)}`)
        .join('/');

      const response = await this.client.get(`${formattedPath}/api/json`, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get job:', error);
      throw error;
    }
  }

  /**
   * Create a folder in Jenkins
   * @param folderConfig The configuration for the folder
   */
  public async createFolder(folderConfig: FolderConfig): Promise<any> {
    try {
      const folderXml = `<?xml version='1.1' encoding='UTF-8'?>
<com.cloudbees.hudson.plugins.folder.Folder>
  <description>${folderConfig.description || ''}</description>
  <properties/>
  <folderViews/>
  <healthMetrics/>
</com.cloudbees.hudson.plugins.folder.Folder>`;

      const response = await this.client.post(
        `createItem?name=${encodeURIComponent(folderConfig.name)}&mode=com.cloudbees.hudson.plugins.folder.Folder`,
        folderXml
      );
      // Check if the response indicates success
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to create folder: ${response.statusText}`);
      }
      // Return the response data
      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }



  /**
   * Create a job in Jenkins using the workflow-job plugin
   * @param jobName The name of the job to create
   * @param repoUrl The URL of the Git repository
   * @param folderName Optional folder where to create the job. If not provided, job will be created at root level
   * @param branch The branch to build (default: main)
   * @param jenkinsfilePath The path to the Jenkinsfile (default: Jenkinsfile)
   * @param credentialId The credential ID to use (default: GITOPS_AUTH_PASSWORD). If folderName is provided and useFolderScopedCredential is true, the credential will be scoped to the folder.
   * @param useFolderScopedCredential Whether to use folder-scoped credentials (default: false)
   */
  public async createJob(
    jobName: string,
    repoUrl: string,
    folderName?: string,
    branch: string = 'main',
    jenkinsfilePath: string = 'Jenkinsfile',
    credentialId: string = 'GITOPS_AUTH_PASSWORD'
  ): Promise<any> {
    try {
      // Determine the path based on whether folderName is provided
      const path = folderName ? `job/${encodeURIComponent(folderName)}/createItem` : 'createItem';

      const jobConfigXml = `
            <flow-definition plugin="workflow-job@2.40">
                <actions/>
                <description></description>
                <keepDependencies>false</keepDependencies>
                <properties>
                    <org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
                        <triggers>
                            <com.cloudbees.jenkins.GitHubPushTrigger plugin="github@1.37.1">
                            <spec/>
                            </com.cloudbees.jenkins.GitHubPushTrigger>
                        </triggers>
                    </org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
                </properties>
                <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps@2.89">
                    <scm class="hudson.plugins.git.GitSCM" plugin="git@4.4.5">
                        <configVersion>2</configVersion>
                        <userRemoteConfigs>
                            <hudson.plugins.git.UserRemoteConfig>
                                <url>${repoUrl}</url>
                                <credentialsId>${credentialId}</credentialsId>
                            </hudson.plugins.git.UserRemoteConfig>
                        </userRemoteConfigs>
                        <branches>
                            <hudson.plugins.git.BranchSpec>
                                <name>*/${branch}</name>
                            </hudson.plugins.git.BranchSpec>
                        </branches>
                        <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
                        <submoduleCfg class="list"/>
                        <extensions/>
                    </scm>
                    <scriptPath>${jenkinsfilePath}</scriptPath>
                    <lightweight>true</lightweight>
                </definition>
                <disabled>false</disabled>
            </flow-definition>
            `;
      const response = await this.client.post(
        `${path}?name=${encodeURIComponent(jobName)}`,
        jobConfigXml,
        {
          headers: {
            'Content-Type': 'application/xml',
          },
        }
      );
      // Check if the response indicates success
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to create job: ${response.statusText}`);
      }
      // Return the response data
      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      console.error('Failed to create job:', error);
      throw error;
    }
  }

  /**
   * Creates a credential in Jenkins using the plain-credentials plugin
   * @param folderName Optional folder where to create the credential. If not provided, credential will be created at root level
   * @param credentialId The ID for the credential
   * @param secretValue The secret value
   * @param credentialType The type of credential (default: CredentialType.SECRET_TEXT), valid options are CredentialType.SECRET_TEXT and CredentialType.USERNAME_PASSWORD
   */
  public async createCredential(
    folderName: string,
    credentialId: string,
    secretValue: string,
    credentialType: CredentialType = CredentialType.SECRET_TEXT
  ): Promise<any> {
    try {
      // The path to create credentials in Jenkins
      const path = folderName
        ? `job/${encodeURIComponent(folderName)}/credentials/store/folder/domain/_/createCredentials`
        : `credentials/store/system/domain/_/createCredentials`;

      // XML for creating secret text credentials using plain-credentials plugin
      let credentialXml;

      if (credentialType === CredentialType.SECRET_TEXT) {
        credentialXml = `
                <org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="plain-credentials">
                    <scope>GLOBAL</scope>
                    <id>${credentialId}</id>
                    <description>Secret variable for ${credentialId}</description>
                    <secret>${secretValue}</secret>
                </org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>
                `;
      } else if (credentialType === CredentialType.USERNAME_PASSWORD) {
        // For username-password credentials
        const [username, password] = secretValue.split(':');
        credentialXml = `
                <com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
                    <scope>GLOBAL</scope>
                    <id>${credentialId}</id>
                    <description>Credentials for ${credentialId}</description>
                    <username>${username}</username>
                    <password>${password}</password>
                </com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
                `;
      } else {
        throw new Error(`Unsupported credential type: ${credentialType}`);
      }

      const response = await this.client.post(path, credentialXml, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });
      // Check if the response indicates success
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Failed to create credential: ${response.statusText}`);
      }
      // Return the response data
      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      console.error(`Failed to create credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Trigger a build for a job
   * @param jobName The name of the job to build
   * @param folderName Optional folder where the job is located. If not provided, job is assumed to be at root level
   * @param parameters Optional build parameters
   */
  public async build(
    jobName: string,
    folderName?: string,
    parameters?: Record<string, string>
  ): Promise<number> {
    try {
      // Determine the path based on whether folderName is provided
      const path = folderName
        ? `job/${encodeURIComponent(folderName)}/job/${encodeURIComponent(jobName)}/build`
        : `job/${encodeURIComponent(jobName)}/build`;

      // If parameters are provided, use buildWithParameters endpoint instead
      const endpoint = parameters ? `${path.replace('build', 'buildWithParameters')}` : path;

      const response = await this.client.post(endpoint, null, {
        headers: {
          'Content-Type': 'application/json',
        },
        params: parameters,
      });

      const queueId = parseQueueId(`${response.headers.location}`);

      return queueId;
    } catch (error) {
      console.error('Failed to trigger job:', error);
      throw error;
    }
  }

  /**
   * Get information about a build
   * @param jobName The name of the job
   * @param buildNumber The build number
   * @param folderName Optional folder where the job is located. If not provided, job is assumed to be at root level
   * @param includeTriggerInfo Whether to include trigger information (default: false)
   * @returns JenkinsBuild object with build information
   */
  public async getBuild(
    jobName: string,
    buildNumber: number,
    folderName?: string,
  ): Promise<JenkinsBuild> {
    try {
      // Determine the path based on whether folderName is provided
      const path = folderName
        ? `job/${encodeURIComponent(folderName)}/job/${encodeURIComponent(jobName)}/${buildNumber}/api/json`
        : `job/${encodeURIComponent(jobName)}/${buildNumber}/api/json`;

      console.log(`Fetching build info for job: ${folderName}/${jobName}, build: ${buildNumber}`);

      // Add query parameter to get more build details
      const response = await this.client.get(path, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        // Don't throw for 404 so we can handle it gracefully
        validateStatus: (status) => {
          return (status >= 200 && status < 300) || status === 404;
        }
      });

      // Handle 404 specifically - the build doesn't exist
      if (response.status === 404) {
        const jobPath = folderName ? `${folderName}/job/${jobName}` : jobName;
        console.error(`Build #${buildNumber} not found for job: ${jobPath}`);
        throw new Error(`Build #${buildNumber} not found for job: ${jobPath}`);
      }

      const buildInfo = response.data as JenkinsBuild;

      // Extract causes from actions if not directly available
      if (!buildInfo.causes && buildInfo.actions) {
        const causesAction = buildInfo.actions.find(action => action.causes);
        if (causesAction && Array.isArray(causesAction.causes)) {
          buildInfo.causes = causesAction.causes;
        }
      }

      // Determine trigger type if requested
      buildInfo.triggerType = this.determineBuildTrigger(buildInfo);

      return buildInfo;
    } catch (error) {
      // Log the error but with clearer context
      const jobPath = folderName ? `${folderName}/job/${jobName}` : jobName;
      
      if (axios.isAxiosError(error)) {
        const axiosError = error;
        
        if (axiosError.response?.status === 404) {
          console.error(`Build #${buildNumber} not found for job: ${jobPath}`);
          throw new Error(`Build #${buildNumber} not found for job: ${jobPath}`);
        }
        
        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          console.error(`Authentication/Authorization error when accessing build #${buildNumber} for job: ${jobPath}`);
          throw new Error(`Authentication failed when accessing Jenkins API for build #${buildNumber}`);
        }
        
        console.error(`API request failed for build #${buildNumber} in job ${jobPath}: ${axiosError.message}`, axiosError.response?.data);
        throw new Error(`Jenkins API request failed: ${axiosError.message}`);
      }
      
      console.error(`Failed to get build information for ${jobPath}#${buildNumber}:`, error);
      throw new Error(`Failed to get build information: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all currently running builds for a job with retry capability
   * @param jobName The name of the job
   * @param folderName Optional folder where the job is located. If not provided, job is assumed to be at root level
   * @param maxRetries Maximum number of retries (default: 5)
   * @param retryDelay Initial delay between retries in ms (default: 2000)
   * @returns Array of running build objects or empty array if none are running
   */
  public async getRunningBuilds(
    jobName: string, 
    folderName?: string,
    maxRetries: number = 5,
    retryDelay: number = 2000
  ): Promise<JenkinsBuild[]> {
    return retry(async (bail, attempt) => {
      try {
        console.log(`Attempt ${attempt}/${maxRetries + 1} to fetch running builds for ${jobName}`);
        
        // Determine the path based on whether folderName is provided
        const path = folderName
          ? `job/${encodeURIComponent(folderName)}/job/${encodeURIComponent(jobName)}/api/json`
          : `job/${encodeURIComponent(jobName)}/api/json`;

        // Get job information with build data
        const response = await this.client.get(path, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          params: {
            tree: 'builds[number,url]', // Request only the build numbers and URLs
          },
        });

        // if builds = 0, throw error to continue the loop
        if (!response.data.builds || response.data.builds.length === 0) {
          console.log(`No builds found for job ${jobName} on attempt ${attempt}`);
          throw new Error('No builds found yet, retrying...');
        }

        const runningBuilds = [];

        // If job has builds, check each one to see if it's running
        if (response.data.builds && response.data.builds.length > 0) {
          for (const build of response.data.builds) {
            // Get detailed build information
            const buildDetails = await this.getBuild(jobName, build.number, folderName);

            // If the build is currently running, add it to our results
            if (buildDetails.building === true) {
              runningBuilds.push(buildDetails);
            }
          }
        }

        console.log(`Found ${runningBuilds.length} running builds for ${jobName} on attempt ${attempt}`);
        
        // If we have running builds or we're on the last attempt, return the results
        if (runningBuilds.length > 0 || attempt >= maxRetries + 1) {
          return runningBuilds;
        }
        
        // If we didn't find running builds and we haven't reached max retries,
        // throw an error to trigger retry
        throw new Error('No running builds found yet, retrying...');
      } catch (error) {
        // Don't retry on specific errors that indicate the job doesn't exist
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.error(`Job ${jobName} not found, aborting retries`);
          bail(error); // This will stop retrying and propagate the error
          return [];
        }
        
        console.log(`Retry attempt ${attempt}/${maxRetries + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        
        // For other errors, or if no running builds found yet, allow retry
        throw error;
      }
    }, {
      retries: maxRetries,
      minTimeout: retryDelay,
      factor: 1.5, // Exponential backoff factor
      onRetry: (error, attempt) => {
        console.log(`Retrying getRunningBuilds (${attempt}/${maxRetries}) after error: ${error}`);
      }
    });
  }

  /**
   * Get the latest build number for a job
   * @param jobName The name of the job
   * @param folderName Optional folder where the job is located
   * @returns The latest build information or null if no builds exist
   */
  public async getLatestBuild(jobName: string, folderName?: string): Promise<JenkinsBuild | null> {
    try {
      // Get job info which includes lastBuild details
      const jobInfo = await this.getJob(folderName ? `${folderName}/${jobName}` : jobName);

      // If there's no lastBuild, return null
      if (!jobInfo.lastBuild) {
        return null;
      }

      // Return the build information
      return await this.getBuild(jobName, jobInfo.lastBuild.number, folderName);
    } catch (error) {
      console.error('Failed to get latest build:', error);
      throw error;
    }
  }

  /**
   * Get the console log for a build
   * @param jobName The name of the job
   * @param buildNumber The build number
   * @param folderName Optional folder where the job is located
   * @param start Optional starting position (byte offset) in the log
   */
  public async getBuildLog(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<string> {
    try {
      const path = folderName
        ? `job/${encodeURIComponent(folderName)}/job/${encodeURIComponent(jobName)}/${buildNumber}/logText/progressiveText`
        : `job/${encodeURIComponent(jobName)}/${buildNumber}/logText/progressiveText`;

      const start: number = 0; // Start from the beginning of the log
      const response = await this.client.get(path, {
        headers: {
          Accept: 'text/plain',
        },
        params: {
          start,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get build log:', error);
      throw error;
    }
  }

  /**
   * Wait for a build to complete with timeout
   * @param jobName The name of the job
   * @param buildNumber The build number
   * @param folderName Optional folder where the job is located
   * @param timeoutMs Timeout in milliseconds (default: 10 minutes)
   * @param pollIntervalMs Polling interval in milliseconds (default: 5 seconds)
   * @returns The completed build information
   */
  public async waitForBuildCompletion(
    jobName: string,
    buildNumber: number,
    folderName?: string,
    timeoutMs: number = 10 * 60 * 1000,
    pollIntervalMs: number = 5000
  ): Promise<JenkinsBuild> {
    try {
      const startTime = Date.now();
      let buildInfo;

      // Poll until build is complete or timeout
      while (true) {
        buildInfo = await this.getBuild(jobName, buildNumber, folderName);

        // Check if build has completed
        if (!buildInfo.building) {
          return buildInfo;
        }

        // Check for timeout
        if (Date.now() - startTime > timeoutMs) {
          throw new Error(`Build #${buildNumber} did not complete within the timeout period`);
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    } catch (error) {
      console.error('Error waiting for build completion:', error);
      throw error;
    }
  }

  /**
   * Get the build associated with a specific git commit SHA
   * @param jobName The name of the job
   * @param commitSha The git commit SHA to search for (can be full SHA or shortened)
   * @param folderName Optional folder where the job is located
   * @param maxBuildsToCheck Maximum number of recent builds to check (default: 50)
   * @returns The latest matching build information or null if no match found
   */
  public async getBuildByCommitSha(
    jobName: string,
    commitSha: string,
    folderName?: string,
    maxBuildsToCheck: number = 50
  ): Promise<JenkinsBuild | null> {
    try {
      // Normalize commitSha by trimming and lowercasing
      const normalizedCommitSha = commitSha.trim().toLowerCase();
      console.log(`Looking for build with commit SHA: ${normalizedCommitSha} in job: ${jobName}`);

      // Get job info to access the builds list
      const jobInfo = await this.getJob(folderName ? `${folderName}/${jobName}` : jobName);

      if (!jobInfo.builds || jobInfo.builds.length === 0) {
        console.log(`No builds found for job: ${jobName}`);
        return null;
      }

      console.log(`Found ${jobInfo.builds.length} builds, checking up to ${maxBuildsToCheck}`);

      // Limit the number of builds to check
      const buildsToCheck = jobInfo.builds.slice(0, maxBuildsToCheck);

      // Array to collect all matching builds
      const matchingBuilds: any[] = [];

      // Check each build for the commit SHA
      for (const buildRef of buildsToCheck) {
        console.log(`Checking build #${buildRef.number}`);
        const buildInfo = await this.getBuild(jobName, buildRef.number, folderName);
        let isMatch = false;

        // Check if the build has actions containing SCM information
        if (buildInfo.actions) {
          for (const action of buildInfo.actions) {
            // Method 1: Check lastBuiltRevision.SHA1
            if (action._class?.includes('hudson.plugins.git') && action.lastBuiltRevision?.SHA1) {
              const buildSha = action.lastBuiltRevision.SHA1.toLowerCase();
              if (
                buildSha === normalizedCommitSha ||
                buildSha.startsWith(normalizedCommitSha) ||
                normalizedCommitSha.startsWith(buildSha)
              ) {
                console.log(`Found matching commit in lastBuiltRevision: ${buildSha}`);
                isMatch = true;
                break;
              }
            }

            // Method 2: Check buildsByBranchName
            if (action.buildsByBranchName) {
              for (const branch in action.buildsByBranchName) {
                if (action.buildsByBranchName[branch].revision?.SHA1) {
                  const branchSha = action.buildsByBranchName[branch].revision.SHA1.toLowerCase();
                  if (
                    branchSha === normalizedCommitSha ||
                    branchSha.startsWith(normalizedCommitSha) ||
                    normalizedCommitSha.startsWith(branchSha)
                  ) {
                    console.log(
                      `Found matching commit in buildsByBranchName for branch ${branch}: ${branchSha}`
                    );
                    isMatch = true;
                    break;
                  }
                }
              }
              if (isMatch) break;
            }

            // Method 3: Check GIT_COMMIT environment variable in build parameters
            if (action.parameters) {
              for (const param of action.parameters) {
                if (
                  (param.name === 'GIT_COMMIT' || param.name === 'ghprbActualCommit') &&
                  param.value
                ) {
                  const paramSha = param.value.toLowerCase();
                  if (
                    paramSha === normalizedCommitSha ||
                    paramSha.startsWith(normalizedCommitSha) ||
                    normalizedCommitSha.startsWith(paramSha)
                  ) {
                    console.log(
                      `Found matching commit in build parameter ${param.name}: ${paramSha}`
                    );
                    isMatch = true;
                    break;
                  }
                }
              }
              if (isMatch) break;
            }

            // Method 4: Check pull request related information
            if (action._class?.includes('pull-request') && action.pullRequest?.source?.commit) {
              const prSha = action.pullRequest.source.commit.toLowerCase();
              if (
                prSha === normalizedCommitSha ||
                prSha.startsWith(normalizedCommitSha) ||
                normalizedCommitSha.startsWith(prSha)
              ) {
                console.log(`Found matching commit in pull request info: ${prSha}`);
                isMatch = true;
                break;
              }
            }
          }
        }

        if (!isMatch) {
          // Method 5: Check in build causes
          if (buildInfo.causes) {
            for (const cause of buildInfo.causes) {
              if (cause.shortDescription && cause.shortDescription.includes(normalizedCommitSha)) {
                console.log(`Found matching commit in build causes: ${cause.shortDescription}`);
                isMatch = true;
                break;
              }
            }
          }
        }

        if (!isMatch) {
          // Method 6: Check in build display name or description
          if (buildInfo.displayName && buildInfo.displayName.includes(normalizedCommitSha)) {
            console.log(`Found matching commit in build display name: ${buildInfo.displayName}`);
            isMatch = true;
          } else if (buildInfo.description && buildInfo.description.includes(normalizedCommitSha)) {
            console.log(`Found matching commit in build description: ${buildInfo.description}`);
            isMatch = true;
          }
        }

        // If this build matches, add it to our collection
        if (isMatch) {
          matchingBuilds.push(buildInfo);
        }
      }

      // If no matching build was found
      if (matchingBuilds.length === 0) {
        console.log(
          `No builds found matching commit SHA: ${normalizedCommitSha} after checking ${buildsToCheck.length} builds`
        );
        return null;
      }

      // Sort matching builds by build number in descending order to get the latest one first
      matchingBuilds.sort((a, b) => b.number - a.number);

      console.log(
        `Found ${matchingBuilds.length} builds matching commit SHA: ${normalizedCommitSha}, returning the latest: #${matchingBuilds[0].number}`
      );
      return matchingBuilds[0];
    } catch (error) {
      console.error(`Failed to find build by commit SHA ${commitSha}:`, error);
      throw error;
    }
  }

  /**
   * Determines the trigger type of a Jenkins build
   * @param build The Jenkins build object
   * @returns The identified trigger type
   */
  private determineBuildTrigger(build: JenkinsBuild): JenkinsBuildTrigger {
    // Check if build has actions array
    if (build.actions && Array.isArray(build.actions)) {
      // Look for pull request related information in actions
      for (const action of build.actions) {
        // Check for GitHub/GitLab pull request plugin information
        if (
          action._class?.includes('pull-request') ||
          action._class?.includes('PullRequestAction') ||
          action.pullRequest ||
          (action.parameters &&
            action.parameters.some(
              (p: any) =>
                p.name?.includes('ghpr') || p.name?.includes('pull') || p.name?.includes('PR')
            ))
        ) {
          return JenkinsBuildTrigger.PULL_REQUEST;
        }
      }
    }

    // Check causes for trigger information
    if (build.causes && Array.isArray(build.causes)) {
      for (const cause of build.causes) {
        // Check for pull request related causes
        if (
          cause.shortDescription &&
          (cause.shortDescription.toLowerCase().includes('pull request') ||
            cause.shortDescription.toLowerCase().includes('pr ') ||
            cause._class?.toLowerCase().includes('pullrequest'))
        ) {
          return JenkinsBuildTrigger.PULL_REQUEST;
        }

        // Check for push related causes
        if (
          cause.shortDescription &&
          (cause.shortDescription.includes('push') ||
            cause._class?.includes('GitHubPushCause') ||
            cause._class?.includes('GitLabWebHookCause'))
        ) {
          return JenkinsBuildTrigger.PUSH;
        }

        // Check for manual build causes
        if (
          cause.shortDescription &&
          (cause.shortDescription.includes('Started by user') ||
            cause._class?.includes('UserIdCause'))
        ) {
          return JenkinsBuildTrigger.MANUAL;
        }

        // Check for scheduled build causes
        if (
          cause.shortDescription &&
          (cause.shortDescription.includes('timer') || cause._class?.includes('TimerTrigger'))
        ) {
          return JenkinsBuildTrigger.SCHEDULED;
        }

        // Check for API/remote build causes
        if (
          cause.shortDescription &&
          (cause.shortDescription.includes('remote') || cause._class?.includes('RemoteCause'))
        ) {
          return JenkinsBuildTrigger.API;
        }
      }
    }

    // Default to PUSH if we have git information but couldn't identify as PR
    if (
      build.actions &&
      build.actions.some(
        action =>
          action._class?.includes('git') || action.lastBuiltRevision || action.buildsByBranchName
      )
    ) {
      return JenkinsBuildTrigger.PUSH;
    }

    return JenkinsBuildTrigger.UNKNOWN;
  }

  /**
   * Get the trigger type of a build (Pull Request, Push, etc.)
   * @param jobName The name of the job
   * @param buildNumber The build number
   * @param folderName Optional folder where the job is located
   * @returns The identified trigger type
   */
  public async getBuildTriggerType(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<JenkinsBuildTrigger> {
    const buildInfo = await this.getBuild(jobName, buildNumber, folderName);
    return buildInfo.triggerType || JenkinsBuildTrigger.UNKNOWN;
  }

  /**
   * Check if a build was triggered by a pull request
   * @param jobName The name of the job
   * @param buildNumber The build number
   * @param folderName Optional folder where the job is located
   * @returns True if the build was triggered by a pull request
   */
  public async isBuildTriggeredByPullRequest(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<boolean> {
    const triggerType = await this.getBuildTriggerType(jobName, buildNumber, folderName);
    return triggerType === JenkinsBuildTrigger.PULL_REQUEST;
  }

  /**
   * Check if a build was triggered by a push event
   * @param jobName The name of the job
   * @param buildNumber The build number
   * @param folderName Optional folder where the job is located
   * @returns True if the build was triggered by a push event
   */
  public async isBuildTriggeredByPush(
    jobName: string,
    buildNumber: number,
    folderName?: string
  ): Promise<boolean> {
    const triggerType = await this.getBuildTriggerType(jobName, buildNumber, folderName);
    return triggerType === JenkinsBuildTrigger.PUSH;
  }


  // public async getBuilds(
  //   jobName: string,
  //   folderName?: string,
  // ): Promise<JenkinsBuild[]> {
  //   try {
  //     const path = folderName
  //       ? `job/${encodeURIComponent(folderName)}/job/${encodeURIComponent(jobName)}/api/json`
  //       : `job/${encodeURIComponent(jobName)}/api/json`;

  //     const response = await this.client.get(path, {
  //       headers: {
  //         Accept: 'application/json',
  //         'Content-Type': 'application/json',
  //       }
  //     });
  //     // Return only the latest builds
  //     return response.data as JenkinsBuild[];
  //   } catch (error) {
  //     console.error('Failed to get builds:', error);
  //     throw error;
  //   }
  // }
  public async getBuildsByQueueId(
    queueId: number,
    folderName?: string
  ): Promise<JenkinsBuild | null> {
    try {
      // Determine the path based on whether folderName is provided
      const path = folderName
        ? `job/${encodeURIComponent(folderName)}/queue/item/${queueId}/api/json`
        : `queue/item/${queueId}/api/json`;

      const response = await this.client.get(path, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      // If the response is empty or not found, return null
      if (!response.data || Object.keys(response.data).length === 0) {
        return null;
      }

      return response.data as JenkinsBuild;
    } catch (error) {
      console.error('Failed to get builds by queue ID:', error);
      throw error;
    }
  }
}

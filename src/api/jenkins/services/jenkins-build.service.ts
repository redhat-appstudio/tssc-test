import { JenkinsHttpClient } from '../http/jenkins-http.client';
import { 
  JenkinsApiResponse, 
  BuildOptions, 
  BuildSearchOptions,
  WaitForBuildOptions,
  JenkinsBuild,
  JenkinsJob,
  JobActivityStatus,
  WaitForJobsOptions
} from '../types/jenkins.types';
import { JenkinsBuildTrigger } from '../enums/jenkins.enums';
import { JenkinsConfig } from '../config/jenkins.config';
import { 
  JenkinsPathBuilder, 
  JenkinsTriggerAnalyzer, 
  JenkinsPollingUtils 
} from '../utils/jenkins.utils';
import { 
  JenkinsBuildNotFoundError, 
  JenkinsBuildTimeoutError,
  JenkinsJobNotFoundError 
} from '../errors/jenkins.errors';

/**
 * Service for Jenkins build-related operations
 */
export class JenkinsBuildService {
  constructor(private httpClient: JenkinsHttpClient) {}

  /**
   * Trigger a build for a job
   */
  async triggerBuild(options: BuildOptions): Promise<JenkinsApiResponse> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(options.jobName, options.folderName);
      const endpoint = options.parameters 
        ? `${path}/${JenkinsConfig.ENDPOINTS.BUILD_WITH_PARAMETERS}` 
        : `${path}/${JenkinsConfig.ENDPOINTS.BUILD}`;
      
      const response = await this.httpClient.post(
        endpoint, 
        null, 
        JenkinsConfig.HEADERS.JSON, 
        options.parameters
      );
      
      return response;
    } catch (error) {
      const jobPath = options.folderName ? `${options.folderName}/${options.jobName}` : options.jobName;
      throw new JenkinsJobNotFoundError(jobPath);
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
    try {
      const path = JenkinsPathBuilder.buildBuildPath(
        jobName, 
        buildNumber, 
        folderName, 
        JenkinsConfig.ENDPOINTS.API_JSON
      );
      
      const buildInfo = await this.httpClient.get<JenkinsBuild>(
        path,
        JenkinsConfig.HEADERS.JSON
      );

      // Determine trigger type if requested
      if (includeTriggerInfo) {
        buildInfo.triggerType = JenkinsTriggerAnalyzer.determineBuildTrigger(buildInfo) as JenkinsBuildTrigger;
      }

      return buildInfo;
    } catch (error) {
      throw new JenkinsBuildNotFoundError(jobName, buildNumber, folderName);
    }
  }

  /**
   * Get all currently running builds for a job
   */
  async getRunningBuilds(jobName: string, folderName?: string): Promise<JenkinsBuild[]> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      
      // Get job information with build data
      const response = await this.httpClient.get<JenkinsJob>(
        `${path}/${JenkinsConfig.ENDPOINTS.API_JSON}`,
        JenkinsConfig.HEADERS.JSON,
        { tree: 'builds[number,url]' }
      );

      const runningBuilds: JenkinsBuild[] = [];

      // If job has builds, check each one to see if it's running
      if (response.builds && response.builds.length > 0) {
        for (const build of response.builds) {
          // Get detailed build information
          const buildDetails = await this.getBuild(jobName, build.number, folderName, false);

          // If the build is currently running, add it to our results
          if (buildDetails.building === true) {
            runningBuilds.push(buildDetails);
          }
        }
      }

      return runningBuilds;
    } catch (error) {
      throw new JenkinsJobNotFoundError(jobName, folderName);
    }
  }

  /**
   * Get the latest build for a job
   */
  async getLatestBuild(jobName: string, folderName?: string): Promise<JenkinsBuild | null> {
    try {
      // Get job info which includes lastBuild details
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const jobInfo = await this.httpClient.get<JenkinsJob>(
        `${path}/${JenkinsConfig.ENDPOINTS.API_JSON}`,
        JenkinsConfig.HEADERS.JSON
      );

      // If there's no lastBuild, return null
      if (!jobInfo.lastBuild) {
        return null;
      }

      // Return the build information
      return await this.getBuild(jobName, jobInfo.lastBuild.number, folderName, false);
    } catch (error) {
      throw new JenkinsJobNotFoundError(jobName, folderName);
    }
  }

  /**
   * Get the console log for a build
   */
  async getBuildLog(jobName: string, buildNumber: number, folderName?: string): Promise<string> {
    try {
      const path = JenkinsPathBuilder.buildBuildPath(
        jobName, 
        buildNumber, 
        folderName, 
        JenkinsConfig.ENDPOINTS.LOG_TEXT
      );

      const log = await this.httpClient.get<string>(
        path,
        JenkinsConfig.HEADERS.PLAIN,
        { start: 0 }
      );

      return log;
    } catch (error) {
      throw new JenkinsBuildNotFoundError(jobName, buildNumber, folderName);
    }
  }

  /**
   * Wait for a build to complete with timeout
   */
  async waitForBuildCompletion(options: WaitForBuildOptions): Promise<JenkinsBuild> {
    const {
      jobName,
      buildNumber,
      folderName,
      timeoutMs = JenkinsConfig.DEFAULT_TIMEOUT_MS,
      pollIntervalMs = JenkinsConfig.DEFAULT_POLL_INTERVAL_MS
    } = options;

    try {
      return await JenkinsPollingUtils.pollUntil(
        () => this.getBuild(jobName, buildNumber, folderName, false),
        (buildInfo: JenkinsBuild) => !buildInfo.building,
        timeoutMs,
        pollIntervalMs
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        throw new JenkinsBuildTimeoutError(jobName, buildNumber, timeoutMs);
      }
      throw error;
    }
  }

  /**
   * Get the build associated with a specific git commit SHA
   */
  async getBuildByCommitSha(options: BuildSearchOptions): Promise<JenkinsBuild | null> {
    const {
      jobName,
      commitSha,
      folderName,
      maxBuildsToCheck = JenkinsConfig.DEFAULT_MAX_BUILDS_TO_CHECK
    } = options;

    try {
      // Normalize commitSha by trimming and lowercasing
      const normalizedCommitSha = commitSha.trim().toLowerCase();
      console.log(`Looking for build with commit SHA: ${normalizedCommitSha} in job: ${jobName}`);

      // Get job info to access the builds list
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const jobInfo = await this.httpClient.get<JenkinsJob>(
        `${path}/${JenkinsConfig.ENDPOINTS.API_JSON}`,
        JenkinsConfig.HEADERS.JSON
      );

      if (!jobInfo.builds || jobInfo.builds.length === 0) {
        console.log(`No builds found for job: ${jobName}`);
        return null;
      }

      console.log(`Found ${jobInfo.builds.length} builds, checking up to ${maxBuildsToCheck}`);

      // Limit the number of builds to check
      const buildsToCheck = jobInfo.builds.slice(0, maxBuildsToCheck);
      const matchingBuilds: JenkinsBuild[] = [];

      // Check each build for the commit SHA
      for (const buildRef of buildsToCheck) {
        console.log(`Checking build #${buildRef.number}`);
        const buildInfo = await this.getBuild(jobName, buildRef.number, folderName, false);
        
        if (this.buildMatchesCommit(buildInfo, normalizedCommitSha)) {
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
      throw new JenkinsJobNotFoundError(jobName, folderName);
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
    const buildInfo = await this.getBuild(jobName, buildNumber, folderName, true);
    return buildInfo.triggerType || JenkinsBuildTrigger.UNKNOWN;
  }

  /**
   * Check if a build was triggered by a pull request
   */
  async isBuildTriggeredByPullRequest(
    jobName: string, 
    buildNumber: number, 
    folderName?: string
  ): Promise<boolean> {
    const triggerType = await this.getBuildTriggerType(jobName, buildNumber, folderName);
    return triggerType === JenkinsBuildTrigger.PULL_REQUEST;
  }

  /**
   * Check if a build was triggered by a push event
   */
  async isBuildTriggeredByPush(
    jobName: string, 
    buildNumber: number, 
    folderName?: string
  ): Promise<boolean> {
    const triggerType = await this.getBuildTriggerType(jobName, buildNumber, folderName);
    return triggerType === JenkinsBuildTrigger.PUSH;
  }

  /**
   * Check if a build matches a specific commit SHA
   */
  private buildMatchesCommit(build: JenkinsBuild, normalizedCommitSha: string): boolean {
    // Check if the build has actions containing SCM information
    if (build.actions) {
      for (const action of build.actions) {
        // Method 1: Check lastBuiltRevision.SHA1
        if (action._class?.includes('hudson.plugins.git') && action.lastBuiltRevision?.SHA1) {
          const buildSha = action.lastBuiltRevision.SHA1.toLowerCase();
          if (this.commitShasMatch(buildSha, normalizedCommitSha)) {
            console.log(`Found matching commit in lastBuiltRevision: ${buildSha}`);
            return true;
          }
        }

        // Method 2: Check buildsByBranchName
        if (action.buildsByBranchName) {
          for (const branch in action.buildsByBranchName) {
            if (action.buildsByBranchName[branch].revision?.SHA1) {
              const branchSha = action.buildsByBranchName[branch].revision.SHA1.toLowerCase();
              if (this.commitShasMatch(branchSha, normalizedCommitSha)) {
                console.log(`Found matching commit in buildsByBranchName for branch ${branch}: ${branchSha}`);
                return true;
              }
            }
          }
        }

        // Method 3: Check GIT_COMMIT environment variable in build parameters
        if (action.parameters) {
          for (const param of action.parameters) {
            if ((param.name === 'GIT_COMMIT' || param.name === 'ghprbActualCommit') && param.value) {
              const paramSha = param.value.toLowerCase();
              if (this.commitShasMatch(paramSha, normalizedCommitSha)) {
                console.log(`Found matching commit in build parameter ${param.name}: ${paramSha}`);
                return true;
              }
            }
          }
        }

        // Method 4: Check pull request related information
        if (action._class?.includes('pull-request') && action.pullRequest?.source?.commit) {
          const prSha = action.pullRequest.source.commit.toLowerCase();
          if (this.commitShasMatch(prSha, normalizedCommitSha)) {
            console.log(`Found matching commit in pull request info: ${prSha}`);
            return true;
          }
        }
      }
    }

    // Method 5: Check in build causes
    if (build.causes) {
      for (const cause of build.causes) {
        if (cause.shortDescription && cause.shortDescription.includes(normalizedCommitSha)) {
          console.log(`Found matching commit in build causes: ${cause.shortDescription}`);
          return true;
        }
      }
    }

    // Method 6: Check in build display name or description
    if (build.displayName && build.displayName.includes(normalizedCommitSha)) {
      console.log(`Found matching commit in build display name: ${build.displayName}`);
      return true;
    } else if (build.description && build.description.includes(normalizedCommitSha)) {
      console.log(`Found matching commit in build description: ${build.description}`);
      return true;
    }

    return false;
  }

  /**
   * Check if two commit SHAs match (handles full and shortened SHAs)
   */
  private commitShasMatch(sha1: string, sha2: string): boolean {
    return sha1 === sha2 || sha1.startsWith(sha2) || sha2.startsWith(sha1);
  }

  /**
   * Get comprehensive activity status for a job (running builds + queue status)
   */
  async getJobActivityStatus(jobName: string, folderName?: string): Promise<JobActivityStatus> {
    try {
      // Get both running builds and job info in parallel
      const [runningBuilds, jobInfo] = await Promise.all([
        this.getRunningBuilds(jobName, folderName),
        this.getJobInfo(jobName, folderName)
      ]);

      const inQueue = jobInfo?.inQueue || false;
      const isActive = runningBuilds.length > 0 || inQueue;

      return {
        jobName,
        folderName,
        runningBuilds,
        inQueue,
        isActive
      };
    } catch (error) {
      throw new JenkinsJobNotFoundError(jobName, folderName);
    }
  }

  /**
   * Get activity status for multiple jobs
   */
  async getMultipleJobsActivityStatus(jobNames: string[], folderName?: string): Promise<JobActivityStatus[]> {
    const statusPromises = jobNames.map(jobName => 
      this.getJobActivityStatus(jobName, folderName).catch(error => {
        console.warn(`Failed to get status for job ${jobName}: ${error.message}`);
        return {
          jobName,
          folderName,
          runningBuilds: [],
          inQueue: false,
          isActive: false
        };
      })
    );

    return await Promise.all(statusPromises);
  }

  /**
   * Wait for multiple jobs to complete (both running builds and queued jobs)
   */
  async waitForMultipleJobsToComplete(options: WaitForJobsOptions): Promise<void> {
    const {
      jobNames,
      folderName,
      timeoutMs = JenkinsConfig.DEFAULT_TIMEOUT_MS,
      pollIntervalMs = JenkinsConfig.DEFAULT_POLL_INTERVAL_MS
    } = options;

    const startTime = Date.now();
    
    console.log(`Waiting for ${jobNames.length} Jenkins jobs to complete: ${jobNames.join(', ')}`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        const jobStatuses = await this.getMultipleJobsActivityStatus(jobNames, folderName);
        
        // Check if any jobs are still active (running or queued)
        const activeJobs = jobStatuses.filter(status => status.isActive);
        
        if (activeJobs.length === 0) {
          console.log(`All Jenkins jobs have completed successfully.`);
          return;
        }

        // Log detailed status
        const statusMessages = jobStatuses.map(status => {
          if (!status.isActive) return null;
          
          const parts = [];
          if (status.runningBuilds.length > 0) {
            parts.push(`${status.runningBuilds.length} running builds`);
          }
          if (status.inQueue) {
            parts.push('queued');
          }
          
          return `${status.jobName}: ${parts.join(', ')}`;
        }).filter(Boolean);

        console.log(`Active jobs (${activeJobs.length}/${jobNames.length}): ${statusMessages.join(' | ')}`);
        
        // Wait before next poll
        await JenkinsPollingUtils.sleep(pollIntervalMs);
      } catch (error) {
        console.warn(`Error checking job statuses: ${error}. Retrying...`);
        await JenkinsPollingUtils.sleep(pollIntervalMs);
      }
    }

    throw new Error(`Timeout waiting for Jenkins jobs to complete: ${jobNames.join(', ')}`);
  }

  /**
   * Get job information including queue status
   * @private helper method
   */
  private async getJobInfo(jobName: string, folderName?: string): Promise<JenkinsJob | null> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const jobInfo = await this.httpClient.get<JenkinsJob>(
        `${path}/${JenkinsConfig.ENDPOINTS.API_JSON}`,
        JenkinsConfig.HEADERS.JSON,
        { tree: 'inQueue,buildable,color,lastBuild[number]' }
      );
      
      return jobInfo;
    } catch (error) {
      console.warn(`Could not get job info for ${jobName}: ${error}`);
      return null;
    }
  }
} 
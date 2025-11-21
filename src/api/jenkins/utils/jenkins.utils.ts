import { CreateJobOptions } from '../types/jenkins.types';
import { JenkinsConfig } from '../config/jenkins.config';

/**
 * Utility class for building Jenkins API paths
 */
export class JenkinsPathBuilder {
  /**
   * Build a job path for API calls
   */
  static buildJobPath(jobName: string, folderName?: string): string {
    return folderName 
      ? `job/${encodeURIComponent(folderName)}/job/${encodeURIComponent(jobName)}`
      : `job/${encodeURIComponent(jobName)}`;
  }

  /**
   * Build a path for creating items (jobs, folders)
   */
  static buildCreateItemPath(folderName?: string): string {
    return folderName 
      ? `job/${encodeURIComponent(folderName)}/${JenkinsConfig.ENDPOINTS.CREATE_ITEM}`
      : JenkinsConfig.ENDPOINTS.CREATE_ITEM;
  }

  /**
   * Build a path for credential operations
   */
  static buildCredentialPath(folderName?: string): string {
    return folderName
      ? `job/${encodeURIComponent(folderName)}/${JenkinsConfig.ENDPOINTS.CREDENTIALS_STORE_FOLDER}`
      : JenkinsConfig.ENDPOINTS.CREDENTIALS_STORE_SYSTEM;
  }

  /**
   * Build a formatted job path for API calls (handles nested folders)
   */
  static buildFormattedJobPath(jobPath: string): string {
    return jobPath
      .split('/')
      .map(segment => `job/${encodeURIComponent(segment)}`)
      .join('/');
  }

  /**
   * Build build-specific API path
   */
  static buildBuildPath(jobName: string, buildNumber: number, folderName?: string, endpoint: string = ''): string {
    const jobPath = this.buildJobPath(jobName, folderName);
    return endpoint ? `${jobPath}/${buildNumber}/${endpoint}` : `${jobPath}/${buildNumber}`;
  }
}

/**
 * Utility class for generating Jenkins XML configurations
 */
export class JenkinsXmlBuilder {
  /**
   * Build XML configuration for Jenkins folder
   */
  static buildFolderXml(description: string = ''): string {
    return `<?xml version='1.1' encoding='UTF-8'?>
<com.cloudbees.hudson.plugins.folder.Folder>
  <description>${this.escapeXml(description)}</description>
  <properties/>
  <folderViews/>
  <healthMetrics/>
</com.cloudbees.hudson.plugins.folder.Folder>`;
  }

  /**
   * Build XML configuration for Jenkins pipeline job
   */
  static buildJobXml(options: CreateJobOptions): string {
    const { 
      repoUrl, 
      branch = JenkinsConfig.DEFAULT_BRANCH, 
      jenkinsfilePath = JenkinsConfig.DEFAULT_JENKINSFILE_PATH, 
      credentialId = JenkinsConfig.DEFAULT_CREDENTIAL_ID 
    } = options;
    
    return `<flow-definition plugin="${JenkinsConfig.PLUGINS.WORKFLOW_JOB}">
  <actions/>
  <description></description>
  <keepDependencies>false</keepDependencies>
  <properties>
  </properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="${JenkinsConfig.PLUGINS.WORKFLOW_CPS}">
    <scm class="hudson.plugins.git.GitSCM" plugin="${JenkinsConfig.PLUGINS.GIT}">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>${this.escapeXml(repoUrl)}</url>
          <credentialsId>${this.escapeXml(credentialId)}</credentialsId>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/${this.escapeXml(branch)}</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="list"/>
      <extensions/>
    </scm>
    <scriptPath>${this.escapeXml(jenkinsfilePath)}</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <disabled>false</disabled>
</flow-definition>`;
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

/**
 * Utility class for analyzing Jenkins build triggers
 */
export class JenkinsTriggerAnalyzer {
  /**
   * Determines the trigger type of a Jenkins build
   */
  static determineBuildTrigger(build: any): string {
    // Check if build has actions array
    if (build.actions && Array.isArray(build.actions)) {
      // Look for pull request related information in actions
      for (const action of build.actions) {
        if (this.isPullRequestTrigger(action)) {
          return 'PULL_REQUEST';
        }
      }
    }

    // Check causes for trigger information
    if (build.causes && Array.isArray(build.causes)) {
      for (const cause of build.causes) {
        const triggerType = this.analyzeCause(cause);
        if (triggerType !== 'UNKNOWN') {
          return triggerType;
        }
      }
    }

    // Default to PUSH if we have git information but couldn't identify as PR
    if (this.hasGitInformation(build)) {
      return 'PUSH';
    }

    return 'UNKNOWN';
  }

  /**
   * Check if action indicates pull request trigger
   */
  private static isPullRequestTrigger(action: any): boolean {
    return action._class?.includes('pull-request') ||
           action._class?.includes('PullRequestAction') ||
           action.pullRequest ||
           (action.parameters && action.parameters.some((p: any) =>
             p.name?.includes('ghpr') || p.name?.includes('pull') || p.name?.includes('PR')));
  }

  /**
   * Analyze build cause to determine trigger type
   */
  private static analyzeCause(cause: any): string {
    if (!cause.shortDescription) {
      return 'UNKNOWN';
    }

    const description = cause.shortDescription.toLowerCase();

    if (description.includes('pull request') || description.includes('pr ') ||
        cause._class?.toLowerCase().includes('pullrequest')) {
      return 'PULL_REQUEST';
    }

    if (description.includes('push') ||
        cause._class?.includes('GitHubPushCause') ||
        cause._class?.includes('GitLabWebHookCause')) {
      return 'PUSH';
    }

    if (description.includes('started by user') ||
        cause._class?.includes('UserIdCause')) {
      return 'MANUAL';
    }

    if (description.includes('timer') ||
        cause._class?.includes('TimerTrigger')) {
      return 'SCHEDULED';
    }

    if (description.includes('remote') ||
        cause._class?.includes('RemoteCause')) {
      return 'API';
    }

    return 'UNKNOWN';
  }

  /**
   * Check if build has git information
   */
  private static hasGitInformation(build: any): boolean {
    return build.actions && build.actions.some((action: any) =>
      action._class?.includes('git') || action.lastBuiltRevision || action.buildsByBranchName);
  }
}

/**
 * Utility class for waiting and polling operations
 */
export class JenkinsPollingUtils {
  /**
   * Generic polling utility with timeout
   */
  static async pollUntil<T>(
    pollFn: () => Promise<T>,
    conditionFn: (result: T) => boolean,
    timeoutMs: number = JenkinsConfig.DEFAULT_TIMEOUT_MS,
    intervalMs: number = JenkinsConfig.DEFAULT_POLL_INTERVAL_MS
  ): Promise<T> {
    const startTime = Date.now();
    
    while (true) {
      const result = await pollFn();
      
      if (conditionFn(result)) {
        return result;
      }
      
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Polling timed out after ${timeoutMs}ms`);
      }
      
      await this.sleep(intervalMs);
    }
  }

  /**
   * Sleep utility
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 
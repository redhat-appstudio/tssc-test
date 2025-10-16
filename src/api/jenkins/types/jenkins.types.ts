import { JenkinsBuildResult, JenkinsBuildTrigger } from '../enums/jenkins.enums';

/**
 * Jenkins API response wrapper
 */
export interface JenkinsApiResponse<T = any> {
  success: boolean;
  status: number;
  data: T;
  location?: string;
}

/**
 * Jenkins client configuration
 */
export interface JenkinsClientConfig {
  baseUrl: string;
  username: string;
  token: string;
  timeout?: number;
}

/**
 * Folder configuration for Jenkins
 */
export interface FolderConfig {
  name: string;
  description?: string;
}

/**
 * Options for creating Jenkins jobs
 */
export interface CreateJobOptions {
  jobName: string;
  repoUrl: string;
  folderName?: string;
  branch?: string;
  jenkinsfilePath?: string;
  credentialId?: string;
}

/**
 * Options for triggering builds
 */
export interface BuildOptions {
  jobName: string;
  folderName?: string;
  parameters?: Record<string, string>;
}

/**
 * Options for searching builds by commit SHA
 */
export interface BuildSearchOptions {
  jobName: string;
  commitSha: string;
  folderName?: string;
  maxBuildsToCheck?: number;
}

/**
 * Options for waiting for build completion
 */
export interface WaitForBuildOptions {
  jobName: string;
  buildNumber: number;
  folderName?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
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

/**
 * Jenkins job information interface
 */
export interface JenkinsJob {
  name: string;
  url: string;
  displayName: string;
  description?: string;
  buildable: boolean;
  color: string;
  healthReport?: Array<{
    description: string;
    iconClassName?: string;
    iconUrl?: string;
    score: number;
  }>;
  builds?: Array<{
    number: number;
    url: string;
  }>;
  firstBuild?: { number: number; url: string } | null;
  lastBuild?: { number: number; url: string } | null;
  lastCompletedBuild?: { number: number; url: string } | null;
  lastFailedBuild?: { number: number; url: string } | null;
  lastStableBuild?: { number: number; url: string } | null;
  lastSuccessfulBuild?: { number: number; url: string } | null;
  lastUnstableBuild?: { number: number; url: string } | null;
  lastUnsuccessfulBuild?: { number: number; url: string } | null;
  nextBuildNumber: number;
  property?: any[];
  actions?: any[];
  queueItem?: any;
  inQueue: boolean;
  parameterDefinitions?: Array<{
    name: string;
    type: string;
    description?: string;
    defaultParameterValue?: {
      name: string;
      value: any;
    };
  }>;
  concurrentBuild: boolean;
  keepDependencies?: boolean;
  scm?: any;
  upstreamProjects?: any[];
  downstreamProjects?: any[];
}

/**
 * Interface for job activity status
 */
export interface JobActivityStatus {
  jobName: string;
  folderName?: string;
  runningBuilds: JenkinsBuild[];
  inQueue: boolean;
  isActive: boolean; // true if either running builds exist OR job is in queue
}

/**
 * Options for waiting for multiple jobs
 */
export interface WaitForJobsOptions {
  jobNames: string[];
  folderName?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
} 
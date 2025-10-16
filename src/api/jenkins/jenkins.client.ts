import { JenkinsHttpClient } from './http/jenkins-http.client';
import { JenkinsJobService } from './services/jenkins-job.service';
import { JenkinsBuildService } from './services/jenkins-build.service';
import { JenkinsCredentialService } from './services/jenkins-credential.service';
import { JenkinsClientConfig } from './types/jenkins.types';
import { BaseApiClient } from '../common/base-api.client';

/**
 * Jenkins API Client
 * 
 * A comprehensive client for interacting with Jenkins CI/CD server. This client provides
 * a service-oriented architecture with dedicated services for different Jenkins operations
 * including job management, build operations, and credential management.
 * 
 * @example Basic Usage
 * ```typescript
 * import { JenkinsClient } from './api/jenkins';
 * 
 * const client = new JenkinsClient({
 *   baseUrl: 'https://jenkins.example.com',
 *   username: 'your-username',
 *   token: 'your-api-token',
 *   timeout: 30000 // Optional, defaults to 30 seconds
 * });
 * 
 * // Check connectivity
 * const isConnected = await client.ping();
 *
 * // Access different services
 * const jobs = await client.jobs.listJobs('folder-name');
 * const builds = await client.builds.getBuild('job-name', 123, 'folder-name');
 * ```
 * 
 * @example Service-Oriented Usage
 * ```typescript
 * // Job operations
 * await client.jobs.createJob('my-job', 'folder', {
 *   repoUrl: 'https://github.com/user/repo.git',
 *   branch: 'main',
 *   jenkinsfilePath: 'Jenkinsfile',
 *   credentialId: 'git-credentials'
 * });
 * 
 * const jobExists = await client.jobs.jobExists('my-job', 'folder');
 * const jobConfig = await client.jobs.getJobConfig('my-job', 'folder');
 * 
 * // Build operations
 * const build = await client.builds.triggerBuild('my-job', 'folder', {
 *   parameters: { PARAM1: 'value1', PARAM2: 'value2' }
 * });
 * 
 * const buildStatus = await client.builds.getBuildStatus('my-job', build.number, 'folder');
 * const buildLogs = await client.builds.getBuildLogs('my-job', build.number, 'folder');
 * 
 * // Credential operations
 * await client.credentials.createSecretTextCredential('folder', 'my-secret', 'secret-value');
 * const credentials = await client.credentials.listCredentials('folder');
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   const build = await client.builds.getBuild('job-name', 123, 'folder');
 * } catch (error) {
 *   if (error instanceof JenkinsJobNotFoundError) {
 *     console.log('Job not found');
 *   } else if (error instanceof JenkinsBuildTimeoutError) {
 *     console.log('Build timed out');
 *   } else if (error instanceof JenkinsAuthenticationError) {
 *     console.log('Authentication failed');
 *   }
 * }
 * ```
 */
export class JenkinsClient extends BaseApiClient {
  /** Service for Jenkins job operations (create, list, configure) */
  public readonly jobs: JenkinsJobService;
  
  /** Service for Jenkins build operations (trigger, get status, logs) */
  public readonly builds: JenkinsBuildService;
  
  /** Service for Jenkins credential operations (create, list, manage) */
  public readonly credentials: JenkinsCredentialService;
  
  /** The underlying HTTP client instance (private) */
  private readonly httpClient: JenkinsHttpClient;

  /**
   * Creates a new Jenkins client instance
   * 
   * @param config Configuration options for the Jenkins client
   * @param config.baseUrl Jenkins server base URL (required)
   * @param config.username Jenkins username (required)
   * @param config.token Jenkins API token (required)
   * @param config.timeout Request timeout in milliseconds (optional, defaults to 30000)
   * 
   * @example
   * ```typescript
   * const client = new JenkinsClient({
   *   baseUrl: 'https://jenkins.example.com',
   *   username: process.env.JENKINS_USERNAME,
   *   token: process.env.JENKINS_TOKEN,
   *   timeout: 30000
   * });
   * ```
   */
  constructor(config: JenkinsClientConfig) {
    super(config.baseUrl, config.timeout || 30000);
    this.httpClient = new JenkinsHttpClient(config);
    this.jobs = new JenkinsJobService(this.httpClient);
    this.builds = new JenkinsBuildService(this.httpClient);
    this.credentials = new JenkinsCredentialService(this.httpClient);
  }

  /**
   * Checks if the Jenkins server is reachable and the client is properly authenticated
   *
   * This method performs a lightweight API call to verify connectivity and authentication.
   * It's useful for health checks and connection validation.
   *
   * @returns Promise<boolean> True if the Jenkins server is reachable and authenticated, false otherwise
   *
   * @example
   * ```typescript
   * const client = new JenkinsClient(config);
   *
   * if (await client.ping()) {
   *   console.log('Jenkins server is accessible');
   * } else {
   *   console.log('Jenkins server is not accessible or credentials are invalid');
   * }
   * ```
   */
  async ping(): Promise<boolean> {
    return this.httpClient.ping();
  }
}
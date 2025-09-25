import { JenkinsHttpClient } from './http/jenkins-http.client';
import { JenkinsJobService } from './services/jenkins-job.service';
import { JenkinsBuildService } from './services/jenkins-build.service';
import { JenkinsCredentialService } from './services/jenkins-credential.service';
import { JenkinsClientConfig } from './types/jenkins.types';

/**
 * Main Jenkins client that provides a facade over the service-oriented architecture
 */
export class JenkinsClient {
  public readonly jobs: JenkinsJobService;
  public readonly builds: JenkinsBuildService;
  public readonly credentials: JenkinsCredentialService;
  private readonly httpClient: JenkinsHttpClient;

  constructor(config: JenkinsClientConfig) {
    this.httpClient = new JenkinsHttpClient(config);
    this.jobs = new JenkinsJobService(this.httpClient);
    this.builds = new JenkinsBuildService(this.httpClient);
    this.credentials = new JenkinsCredentialService(this.httpClient);
  }

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
}
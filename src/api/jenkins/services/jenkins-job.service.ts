import { JenkinsHttpClient } from '../http/jenkins-http.client';
import { 
  JenkinsApiResponse, 
  FolderConfig, 
  CreateJobOptions,
  JenkinsJob
} from '../types/jenkins.types';
import { JenkinsConfig } from '../config/jenkins.config';
import { JenkinsPathBuilder, JenkinsXmlBuilder } from '../utils/jenkins.utils';
import { JenkinsFolderError, JenkinsJobNotFoundError } from '../errors/jenkins.errors';

/**
 * Service for Jenkins job-related operations
 */
export class JenkinsJobService {
  constructor(private httpClient: JenkinsHttpClient) {}

  /**
   * Create a folder in Jenkins
   */
  async createFolder(folderConfig: FolderConfig): Promise<JenkinsApiResponse> {
    try {
      const folderXml = JenkinsXmlBuilder.buildFolderXml(folderConfig.description);
      const path = `${JenkinsConfig.ENDPOINTS.CREATE_ITEM}?name=${encodeURIComponent(folderConfig.name)}&mode=com.cloudbees.hudson.plugins.folder.Folder`;
      
      const response = await this.httpClient.post(path, folderXml, JenkinsConfig.HEADERS.XML);
      
      return response;
    } catch (error) {
      throw new JenkinsFolderError(
        folderConfig.name,
        'create',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Create a job in Jenkins
   */
  async createJob(options: CreateJobOptions): Promise<JenkinsApiResponse> {
    try {
      const path = JenkinsPathBuilder.buildCreateItemPath(options.folderName);
      const jobXml = JenkinsXmlBuilder.buildJobXml(options);
      
      const response = await this.httpClient.post(
        `${path}?name=${encodeURIComponent(options.jobName)}`,
        jobXml,
        JenkinsConfig.HEADERS.XML
      );
      
      return response;
    } catch (error) {
      const jobPath = options.folderName ? `${options.folderName}/${options.jobName}` : options.jobName;
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }

  /**
   * Get information about a job
   */
  async getJob(jobPath: string): Promise<JenkinsJob> {
    try {
      const formattedPath = JenkinsPathBuilder.buildFormattedJobPath(jobPath);
      const response = await this.httpClient.get<JenkinsJob>(
        `${formattedPath}/${JenkinsConfig.ENDPOINTS.API_JSON}`,
        JenkinsConfig.HEADERS.JSON
      );

      return response;
    } catch (error) {
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }

  /**
   * Get job by name and optional folder
   */
  async getJobByName(jobName: string, folderName?: string): Promise<JenkinsJob> {
    const jobPath = folderName ? `${folderName}/${jobName}` : jobName;
    return this.getJob(jobPath);
  }

  /**
   * Delete a job
   */
  async deleteJob(jobName: string, folderName?: string): Promise<JenkinsApiResponse> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const response = await this.httpClient.post(`${path}/doDelete`, '', JenkinsConfig.HEADERS.JSON);
      
      return response;
    } catch (error) {
      const jobPath = folderName ? `${folderName}/${jobName}` : jobName;
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }

  /**
   * Check if a job exists
   */
  async jobExists(jobName: string, folderName?: string): Promise<boolean> {
    try {
      await this.getJobByName(jobName, folderName);
      return true;
    } catch (error) {
      if (error instanceof JenkinsJobNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get all jobs in a folder (or root if no folder specified)
   */
  async getJobs(folderName?: string): Promise<JenkinsJob[]> {
    try {
      const path = folderName 
        ? `job/${encodeURIComponent(folderName)}/${JenkinsConfig.ENDPOINTS.API_JSON}`
        : JenkinsConfig.ENDPOINTS.API_JSON;
      
      const response = await this.httpClient.get<{ jobs: JenkinsJob[] }>(
        path,
        JenkinsConfig.HEADERS.JSON,
        { tree: 'jobs[name,url,color,buildable]' }
      );

      return response.jobs || [];
    } catch (error) {
      if (folderName) {
        throw new JenkinsFolderError(folderName, 'list jobs in', 'Folder not found or accessible');
      }
      throw error;
    }
  }

  /**
   * Disable a job
   */
  async disableJob(jobName: string, folderName?: string): Promise<JenkinsApiResponse> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const response = await this.httpClient.post(`${path}/disable`, '', JenkinsConfig.HEADERS.JSON);
      
      return response;
    } catch (error) {
      const jobPath = folderName ? `${folderName}/${jobName}` : jobName;
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }

  /**
   * Enable a job
   */
  async enableJob(jobName: string, folderName?: string): Promise<JenkinsApiResponse> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const response = await this.httpClient.post(`${path}/enable`, '', JenkinsConfig.HEADERS.JSON);
      
      return response;
    } catch (error) {
      const jobPath = folderName ? `${folderName}/${jobName}` : jobName;
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }

  /**
   * Update job configuration
   */
  async updateJobConfig(jobName: string, configXml: string, folderName?: string): Promise<JenkinsApiResponse> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const response = await this.httpClient.post(`${path}/config.xml`, configXml, JenkinsConfig.HEADERS.XML);
      
      return response;
    } catch (error) {
      const jobPath = folderName ? `${folderName}/${jobName}` : jobName;
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }

  /**
   * Get job configuration XML
   */
  async getJobConfig(jobName: string, folderName?: string): Promise<string> {
    try {
      const path = JenkinsPathBuilder.buildJobPath(jobName, folderName);
      const response = await this.httpClient.get<string>(`${path}/config.xml`, JenkinsConfig.HEADERS.XML);
      
      return response;
    } catch (error) {
      const jobPath = folderName ? `${folderName}/${jobName}` : jobName;
      throw new JenkinsJobNotFoundError(jobPath);
    }
  }
} 
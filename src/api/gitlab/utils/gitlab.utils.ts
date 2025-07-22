import { PipelineStatus } from '../../../rhtap/core/integration/ci/pipeline';
import { GITLAB_PIPELINE_STATUS_MAPPING } from '../types/gitlab.types';

/**
 * Utility functions for GitLab operations
 */
export class GitLabUtils {
  /**
   * Validates a GitLab project path format
   */
  public static isValidProjectPath(projectPath: string): boolean {
    // GitLab project paths should be in format "owner/repo" or "group/subgroup/repo"
    const pathRegex = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)*$/;
    return pathRegex.test(projectPath);
  }

  /**
   * Validates a GitLab branch name
   */
  public static isValidBranchName(branchName: string): boolean {
    // GitLab branch names cannot contain certain characters
    const invalidChars = /[~^:?*\[\]\\]/;
    return !invalidChars.test(branchName) && branchName.trim() === branchName;
  }

  /**
   * Encodes a project path for use in GitLab API URLs
   */
  public static encodeProjectPath(projectPath: string): string {
    return encodeURIComponent(projectPath);
  }

  /**
   * Formats a GitLab URL for a project
   */
  public static formatProjectUrl(baseUrl: string, projectPath: string): string {
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    return `${cleanBaseUrl}/${projectPath}`;
  }

  /**
   * Formats a GitLab URL for a merge request
   */
  public static formatMergeRequestUrl(baseUrl: string, projectPath: string, mergeRequestId: number): string {
    const projectUrl = this.formatProjectUrl(baseUrl, projectPath);
    return `${projectUrl}/-/merge_requests/${mergeRequestId}`;
  }

  /**
   * Maps GitLab pipeline status to standardized status
   */
  public static mapPipelineStatus(gitlabStatus: string): PipelineStatus {
    return GITLAB_PIPELINE_STATUS_MAPPING[gitlabStatus.toLowerCase()] || PipelineStatus.UNKNOWN;
  }

  /**
   * Checks if a GitLab pipeline status indicates completion
   */
  public static isPipelineCompleted(status: string): boolean {
    const mappedStatus = this.mapPipelineStatus(status);
    return mappedStatus === PipelineStatus.SUCCESS || mappedStatus === PipelineStatus.FAILURE;
  }

  /**
   * Checks if a GitLab pipeline status indicates success
   */
  public static isPipelineSuccessful(status: string): boolean {
    const mappedStatus = this.mapPipelineStatus(status);
    return mappedStatus === PipelineStatus.SUCCESS;
  }

  /**
   * Extracts project information from a GitLab URL
   */
  public static extractProjectInfoFromUrl(gitlabUrl: string): { baseUrl: string; projectPath: string } | null {
    try {
      const url = new URL(gitlabUrl);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      
      // GitLab URLs typically have format: /group/[subgroups...]/project/[-/...]
      // Find the index where GitLab-specific paths start (e.g., -/merge_requests)
      const gitlabPathIndex = pathParts.findIndex(part => part === '-');
     
      if (gitlabPathIndex === -1) {
        // No GitLab-specific path, assume all parts form the project path
        if (pathParts.length < 2) {
          return null;
        }
        const projectPath = pathParts.join('/');
        return { baseUrl: `${url.protocol}//${url.host}`, projectPath };
      } else if (gitlabPathIndex < 2) {
         return null;
      } else {
        // Extract project path up to the GitLab-specific part
        const projectPath = pathParts.slice(0, gitlabPathIndex).join('/');
        return { baseUrl: `${url.protocol}//${url.host}`, projectPath };
      }
    } catch {
      return null;
    }
  }

  /**
   * Normalizes GitLab base URL
   */
  public static normalizeBaseUrl(baseUrl: string): string {
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    return baseUrl.replace(/\/$/, '');
  }

  /**
   * Generates a unique identifier for a GitLab pipeline
   */
  public static generatePipelineIdentifier(projectPath: string, pipelineId: number): string {
    return `${projectPath}/${pipelineId}`;
  }

  /**
   * Parses a pipeline identifier back to project path and pipeline ID
   */
  public static parsePipelineIdentifier(identifier: string): { projectPath: string; pipelineId: number } | null {
    const lastSlashIndex = identifier.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      return null;
    }
    
    const projectPath = identifier.substring(0, lastSlashIndex);
    const pipelineIdStr = identifier.substring(lastSlashIndex + 1);
    const pipelineId = parseInt(pipelineIdStr, 10);
    
    if (isNaN(pipelineId)) {
      return null;
    }
    
    return { projectPath, pipelineId };
  }

  /**
   * Validates a GitLab token format
   */
  public static isValidToken(token: string): boolean {
    // GitLab personal access tokens typically start with 'glpat-' and are followed by 26 characters
    // OAuth tokens start with 'glo-' or 'gloas-'
    const tokenRegex = /^(glpat-[a-zA-Z0-9_-]{20,}|glo-[a-zA-Z0-9_-]{20,}|gloas-[a-zA-Z0-9_-]{20,})$/;
    return tokenRegex.test(token);
  }

  /**
   * Sanitizes a token for logging (shows only first few characters)
   */
  public static sanitizeToken(token: string): string {
    if (token.length <= 8) {
      return '***';
    }
    return `${token.substring(0, 8)}...`;
  }
} 
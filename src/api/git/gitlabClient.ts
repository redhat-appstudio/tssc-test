import { Gitlab } from '@gitbeaker/rest';
import { ContentModifications } from '../../rhtap/modification/contentModification';

/**
 * Interface definitions for GitLab API responses
 */
export interface GitLabProject {
  id: number;
  name: string;
  description: string;
  web_url: string;
  default_branch: string;
  visibility: string;
  namespace: {
    id: number;
    name: string;
    path: string;
  };
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
  author: {
    id: number;
    name: string;
    username: string;
  };
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  created_at: string;
}

export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  web_url: string;
}

export interface GitLabClientOptions {
  token: string;
  baseUrl?: string;
}
/**
 * GitLab API client class
 */
export class GitLabClient {
  private client: InstanceType<typeof Gitlab>;

  /**
   * Create a new GitLab client
   * @param baseUrl The base URL of the GitLab instance
   * @param token Personal access token for authentication
   */
  constructor(options: GitLabClientOptions) {
    this.client = new Gitlab({
      host: options.baseUrl || 'https://gitlab.com',
      token: options.token,
    });
  }

  /**
   * Get all projects
   */
  async getProjects(
    params: { owned?: boolean; membership?: boolean; search?: string } = {}
  ): Promise<GitLabProject[]> {
    return (await this.client.Projects.all(params)) as any;
  }

  /**
   * Get a specific project
   */
  async getProject(projectId: number | string): Promise<GitLabProject> {
    return (await this.client.Projects.show(projectId)) as any;
  }

  /**
   * Get branches in a project
   */
  async getBranches(projectId: number | string): Promise<GitLabBranch[]> {
    return (await this.client.Branches.all(projectId)) as any;
  }

  /**
   * Get a specific branch in a project
   */
  async getBranch(projectId: number | string, branch: string): Promise<GitLabBranch> {
    return (await this.client.Branches.show(projectId, branch)) as any;
  }

  /**
   * Get commits in a project
   */
  async getCommits(
    projectId: number | string,
    params: { ref_name?: string; path?: string; since?: string; until?: string } = {}
  ): Promise<GitLabCommit[]> {
    return (await this.client.Commits.all(projectId, params)) as any;
  }

  /**
   * Create a file in the repository
   */
  async createFile(
    projectId: number | string,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<any> {
    return await this.client.RepositoryFiles.create(projectId, filePath, branch, content, commitMessage);
  }

  /**
   * Update a file in the repository
   */
  async updateFile(
    projectId: number | string,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<any> {
    return await this.client.RepositoryFiles.edit(projectId, filePath, branch, content, commitMessage);
  }

  /**
   * Configure a webhook on a repository
   * @param owner The owner (username or group) of the repository
   * @param repo The name of the repository
   * @param webhookUrl The URL to send webhook events to
   * @param options Additional webhook configuration options including token and event triggers
   * @returns The created webhook object
   */
  async configWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
  ): Promise<any> {
    const project = await this.client.Projects.show(`${owner}/${repo}`);

    if (!project) {
      throw new Error(`Project ${owner}/${repo} not found`);
    }

    const projectId = project.id;

    // Map options to GitLab API
    const hookOptions: any = {
      url: webhookUrl,
      token: '',
      push_events: true,
      mergeRequestsEvents: true,
      tagPushEvents: true,
      enableSslVerification: false
    };

    // Remove undefined
    // Object.keys(hookOptions).forEach(k => hookOptions[k] === undefined && delete hookOptions[k]);

    return await this.client.ProjectHooks.add(projectId, webhookUrl, hookOptions);
  }

  /**
   * Create a merge request with branch creation and file modifications
   * @param owner Repository owner (username or group)
   * @param repo Repository name
   * @param targetOwner Target repository owner
   * @param baseBranch Base branch name
   * @param newBranchName New branch name to create
   * @param contentModifications Object containing file modifications
   * @param title Merge request title
   * @param description Merge request description
   * @returns Object containing the PR number and commit SHA
   */
  async createMergeRequest(
    group: string,
    repo: string,
    targetGroup: string,
    baseBranch: string,
    newBranchName: string,
    contentModifications: ContentModifications,
    title: string,
    description: string
  ): Promise<{ prNumber: number; commitSha: string }>;

  /**
   * Create a merge request (alternative signature for direct project ID)
   * @param projectId Project ID
   * @param sourceBranch Source branch name
   * @param targetBranch Target branch name
   * @param title Merge request title
   * @param options Additional options for the merge request
   * @param contentModifications Object containing file modifications
   * @returns Created merge request object
   */
  async createMergeRequest(
    projectId: number | string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    options?: { description?: string },
    contentModifications?: ContentModifications
  ): Promise<GitLabMergeRequest>;

  // Implementation that handles both overloads
  async createMergeRequest(
    ownerOrProjectId: string | number,
    repoOrSourceBranch: string,
    targetOwnerOrTargetBranch: string,
    baseBranchOrTitle: string,
    newBranchNameOrOptions?: string | { description?: string },
    contentModifications?: ContentModifications,
    title?: string,
    description?: string
  ): Promise<{ prNumber: number; commitSha: string } | GitLabMergeRequest> {
    // Check if called with the repository format (first signature)
    if (
      typeof ownerOrProjectId === 'string' &&
      typeof repoOrSourceBranch === 'string' &&
      typeof targetOwnerOrTargetBranch === 'string' &&
      typeof baseBranchOrTitle === 'string' &&
      typeof newBranchNameOrOptions === 'string' &&
      contentModifications &&
      title &&
      description
    ) {
      const owner = ownerOrProjectId;
      const repo = repoOrSourceBranch;
      // targetOwner is not used in implementation but kept for API consistency
      const baseBranch = baseBranchOrTitle;
      const newBranchName = newBranchNameOrOptions;
      
      try {
        // Find the project ID for the repository
        const projects = await this.getProjects({ search: repo });
        const project = projects.find(p => p.name === repo && p.namespace.path === owner);

        if (!project) {
          throw new Error(`Project ${owner}/${repo} not found`);
        }

        const projectId = project.id;

        // Create a new branch from the base branch
        await this.client.Branches.create(projectId, newBranchName, baseBranch);
        console.log(`Created new branch '${newBranchName}' from '${baseBranch}'`);

        // Process all file modifications in one batch
        const fileModifications: { 
          action: 'create' | 'update';
          filePath: string;
          content: string; 
        }[] = [];
        
        // First, collect all file modifications
        for (const [filePath, modifications] of Object.entries(contentModifications)) {
          try {
            let fileContent: string;
            
            // Try to get existing file content first
            try {
              const fileData = await this.client.RepositoryFiles.show(
                projectId, 
                filePath, 
                baseBranch
              );
              fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
              
              // Apply each modification in sequence
              for (const { oldContent, newContent } of modifications) {
                fileContent = fileContent.replace(oldContent, newContent);
              }
              
              fileModifications.push({
                action: 'update',
                filePath,
                content: fileContent
              });
              
            } catch (error: any) {
              if (error.message && error.message.includes('not found')) {
                // File doesn't exist yet, start with empty content
                fileContent = '';
                
                // Apply each modification in sequence (for new files)
                for (const { oldContent, newContent } of modifications) {
                  fileContent = fileContent.replace(oldContent, newContent);
                }
                
                fileModifications.push({
                  action: 'create',
                  filePath,
                  content: fileContent
                });
              } else {
                throw error;
              }
            }
          } catch (error: any) {
            console.error(`Error preparing file modification for ${filePath}: ${error.message}`);
            throw error;
          }
        }
        
        // Now batch commit all changes
        const commitActions = fileModifications.map(mod => ({
          action: mod.action,
          filePath: mod.filePath,
          content: mod.content
        }));
        
        // Commit all changes at once using the Commits API
        await this.client.Commits.create(
          projectId,
          newBranchName,
          title, // Using MR title as commit message
          commitActions
        );
        
        console.log(`Committed ${commitActions.length} file changes to branch ${newBranchName}`);

        // Create merge request from new branch to base branch
        const mergeRequest = await this.client.MergeRequests.create(
          projectId,
          newBranchName,
          baseBranch,
          title,
          {
            description: description,
            removeSourceBranch: true
          }
        );

        // Get the commit SHA from the branch
        const commits = await this.getCommits(projectId, { ref_name: newBranchName });
        const commitSha = commits.length > 0 ? commits[0].id : 'unknown';

        console.log(`Created merge request #${mergeRequest.iid} with commit SHA: ${commitSha}`);
        return { prNumber: mergeRequest.iid, commitSha };
      } catch (error: any) {
        console.error(`Error creating merge request: ${error.message}`);
        throw error;
      }
    } 
    // Called with the project ID format (second signature)
    else {
      const projectId = ownerOrProjectId;
      const sourceBranch = repoOrSourceBranch;
      const targetBranch = targetOwnerOrTargetBranch;
      const title = baseBranchOrTitle;
      const options = newBranchNameOrOptions as { description?: string } || {};
      
      try {
        let sourceBranchExists = false;
        
        // Check if source branch already exists
        try {
          await this.client.Branches.show(projectId, sourceBranch);
          sourceBranchExists = true;
          console.log(`Source branch '${sourceBranch}' already exists`);
        } catch (error: any) {
          if (error.message && error.message.includes('not found')) {
            // Branch doesn't exist, need to create it
            console.log(`Source branch '${sourceBranch}' doesn't exist, will create it`);
            sourceBranchExists = false;
            
            // Create the branch from target branch
            await this.client.Branches.create(projectId, sourceBranch, targetBranch);
            console.log(`Created new branch '${sourceBranch}' from '${targetBranch}'`);
          } else {
            throw error;
          }
        }
        
        // Handle content modifications if provided
        if (contentModifications) {
          console.log(`Processing file modifications for merge request in project ${projectId}`);
          
          // Process all file modifications in one batch
          const fileModifications: { 
            action: 'create' | 'update';
            filePath: string;
            content: string; 
          }[] = [];
          
          // First, collect all file modifications
          for (const [filePath, modifications] of Object.entries(contentModifications)) {
            try {
              let fileContent: string;
              let fileAction: 'create' | 'update' = 'update';
              
              // Try to get existing file content first - use target branch as reference
              // for new branches or source branch for existing branches
              const refBranch = sourceBranchExists ? sourceBranch : targetBranch;
              
              try {
                const fileData = await this.client.RepositoryFiles.show(
                  projectId, 
                  filePath, 
                  refBranch
                );
                fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
              } catch (error: any) {
                if (error.message && error.message.includes('not found')) {
                  // File doesn't exist yet, start with empty content
                  fileContent = '';
                  fileAction = 'create';
                } else {
                  throw error;
                }
              }
              
              // Apply each modification in sequence
              for (const { oldContent, newContent } of modifications) {
                fileContent = fileContent.replace(oldContent, newContent);
              }
              
              // Add this file to the actions array
              fileModifications.push({
                action: fileAction,
                filePath: filePath,
                content: fileContent
              });
              
            } catch (error: any) {
              console.error(`Error preparing file modification for ${filePath}: ${error.message}`);
              throw error;
            }
          }
          
          // Create a commit with all file modifications in a single batch
          if (fileModifications.length > 0) {
            console.log(`Committing ${fileModifications.length} file changes to branch ${sourceBranch}`);
            
            // Use the GitLab API to commit all files in a single batch
            await this.client.Commits.create(
              projectId,
              sourceBranch,
              title, // Using MR title as commit message
              fileModifications
            );
          } else {
            console.log('No file changes to commit');
          }
        }

        // Create merge request
        const mergeRequest = await this.client.MergeRequests.create(
          projectId, 
          sourceBranch, 
          targetBranch, 
          title, 
          options
        );
        
        return mergeRequest as GitLabMergeRequest;
      } catch (error: any) {
        console.error(`Error creating merge request: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Get file content from the repository
   * @param projectId Project ID
   * @param filePath Path to the file in the repository
   * @param branch Branch name
   * @returns Promise with the file content (base64 encoded)
   */
  async getFileContent(
    projectId: number | string,
    filePath: string,
    branch: string = 'main'
  ): Promise<{ content: string; encoding: string }> {
    try {
      const fileContent = await this.client.RepositoryFiles.show(
        projectId,
        filePath,
        branch
      );

      if (!fileContent || !fileContent.content) {
        throw new Error(`Could not retrieve content for file: ${filePath}`);
      }

      return {
        content: fileContent.content,
        encoding: fileContent.encoding || 'base64'
      };
    } catch (error: any) {
      console.error(`Error getting file content from ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extracts content from a file that matches a regular expression pattern
   *
   * @param projectId - The project ID
   * @param filePath - Path to the file in the repository
   * @param searchPattern - Regular expression pattern to search for in the file
   * @param branch - Branch to search in (default: 'main')
   * @returns Promise resolving to an array of matches (empty array if no matches or file not found)
   *
   * @example
   * // Extract the image value from a YAML file
   * const imageValues = await gitlabClient.extractContentByRegex(
   *   projectId,
   *   'components/my-app/overlays/development/deployment-patch.yaml',
   *   /(?:^|\s+)-\s+image:\s+(.+)$/m,
   *   'main'
   * );
   */
  async extractContentByRegex(
    projectId: number | string,
    filePath: string,
    searchPattern: RegExp,
    branch: string = 'main'
  ): Promise<string[]> {
    try {
      console.log(`Searching for pattern ${searchPattern} in file ${filePath} (${branch} branch)`);

      // Get the file content
      const fileContent = await this.client.RepositoryFiles.show(
        projectId,
        filePath,
        branch
      );

      if (!fileContent || !fileContent.content) {
        console.log(`Could not retrieve content for file: ${filePath}`);
        return [];
      }

      // Decode the content from base64
      const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');

      // Search for the pattern
      const matches = content.match(searchPattern);

      if (!matches) {
        console.log(`No matches found in file ${filePath}`);
        return [];
      }

      console.log(`Found ${matches.length} matches in ${filePath}`);
      return matches;
    } catch (error) {
      console.error(`Error extracting content with regex from ${filePath}: ${error}`);
      return [];
    }
  }

  /**
   * Merges a merge request in a GitLab project
   * @param projectId Project ID
   * @param mergeRequestId Merge request IID (internal ID, not global ID)
   * @param options Additional merge options
   * @returns Promise with the merge information
   */
  async mergeMergeRequest(
    projectId: number | string,
    mergeRequestId: number,
    options?: {
      mergeCommitMessage?: string;
      squash?: boolean;
      squashCommitMessage?: string;
      shouldRemoveSourceBranch?: boolean;
    }
  ): Promise<{ id: string; sha: string; mergeCommitSha: string }> {
    try {
      console.log(`Merging merge request #${mergeRequestId} in project ${projectId}`);
      
      // Convert options if provided
      let mergeOptions = {};
      if (options) {
        if (options.shouldRemoveSourceBranch) {
          mergeOptions = { ...mergeOptions, should_remove_source_branch: options.shouldRemoveSourceBranch };
        }
        if (options.mergeCommitMessage) {
          mergeOptions = { ...mergeOptions, merge_commit_message: options.mergeCommitMessage };
        }
      }
      
      // Use GitLab API to accept the merge request (correct method is accept, not merge)
      const response = await this.client.MergeRequests.accept(projectId, mergeRequestId, mergeOptions);

      console.log(`Successfully merged merge request #${mergeRequestId}`);
      
      // For debugging, log the structure of the response
      console.log(`Merge response data: ${JSON.stringify({
        id: response.id,
        iid: response.iid,
        sha: response.sha,
        merge_commit_sha: response.merge_commit_sha
      }, null, 2)}`);
      
      // If merge_commit_sha is not available, we need to fetch it separately
      let mergeCommitSha = response.merge_commit_sha;
      
      if (!mergeCommitSha) {
        console.log(`merge_commit_sha not found in merge response, fetching merge request details to get it`);
        try {
          // Fetch the merge request details after merging to get the merge commit SHA
          const mergeRequestDetails = await this.client.MergeRequests.show(projectId, mergeRequestId);
          mergeCommitSha = mergeRequestDetails.merge_commit_sha;
          console.log(`Fetched merge commit SHA: ${mergeCommitSha}`);
        } catch (detailsError) {
          console.error(`Failed to fetch merge request details: ${detailsError}`);
        }
      }
      
      // If we still don't have a merge commit SHA, fall back to the regular SHA
      if (!mergeCommitSha) {
        console.warn(`Could not obtain merge_commit_sha, falling back to commit SHA`);
        mergeCommitSha = response.sha;
      }
      
      return {
        id: String(response.id || mergeRequestId),
        sha: String(response.sha || ''),
        mergeCommitSha: String(mergeCommitSha || '')
      };
    } catch (error: any) {
      console.error(`Failed to merge merge request #${mergeRequestId}: ${error.message}`);
      throw new Error("Failed to merge Merge Request. Check below error");
    }
  }
}

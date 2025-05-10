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

export interface GitLabRepository {
  root_ref: string;
  empty: boolean;
  size: number;
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
    owner: string,
    repo: string,
    targetOwner: string,
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

        // Process each file modification
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
            } catch (error: any) {
              if (error.message && error.message.includes('not found')) {
                // File doesn't exist yet, start with empty content
                fileContent = '';
              } else {
                throw error;
              }
            }
            
            // Apply each modification in sequence
            for (const { oldContent, newContent } of modifications) {
              fileContent = fileContent.replace(oldContent, newContent);
            }
            
            try {
              // Try to update the file, create it if it doesn't exist
              await this.updateFile(
                projectId,
                filePath,
                newBranchName,
                fileContent,
                `Update ${filePath}`
              );
              console.log(`Updated file ${filePath} in branch ${newBranchName}`);
            } catch (error: any) {
              if (error.message && error.message.includes('not found')) {
                // File doesn't exist yet in the new branch, create it
                await this.createFile(
                  projectId,
                  filePath,
                  newBranchName,
                  fileContent,
                  `Create ${filePath}`
                );
                console.log(`Created new file ${filePath} in branch ${newBranchName}`);
              } else {
                throw error;
              }
            }
          } catch (error: any) {
            console.error(`Error modifying file ${filePath}: ${error.message}`);
            throw error;
          }
        }

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
        // Handle content modifications if provided
        if (contentModifications) {
          console.log(`Processing file modifications for merge request in project ${projectId}`);
          
          // Process each file modification
          for (const [filePath, modifications] of Object.entries(contentModifications)) {
            try {
              let fileContent: string;
              
              // Try to get existing file content first
              try {
                const fileData = await this.client.RepositoryFiles.show(
                  projectId, 
                  filePath, 
                  targetBranch // Use target branch as base for content
                );
                fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
              } catch (error: any) {
                if (error.message && error.message.includes('not found')) {
                  // File doesn't exist yet, start with empty content
                  fileContent = '';
                } else {
                  throw error;
                }
              }
              
              // Apply each modification in sequence
              for (const { oldContent, newContent } of modifications) {
                fileContent = fileContent.replace(oldContent, newContent);
              }
              
              try {
                // Try to update the file, create it if it doesn't exist
                await this.updateFile(
                  projectId,
                  filePath,
                  sourceBranch,
                  fileContent,
                  `Update ${filePath}`
                );
                console.log(`Updated file ${filePath} in branch ${sourceBranch}`);
              } catch (error: any) {
                if (error.message && error.message.includes('not found')) {
                  // File doesn't exist yet in the source branch, create it
                  await this.createFile(
                    projectId,
                    filePath,
                    sourceBranch,
                    fileContent,
                    `Create ${filePath}`
                  );
                  console.log(`Created new file ${filePath} in branch ${sourceBranch}`);
                } else {
                  throw error;
                }
              }
            } catch (error: any) {
              console.error(`Error modifying file ${filePath}: ${error.message}`);
              throw error;
            }
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
}

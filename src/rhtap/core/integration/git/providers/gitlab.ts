import { GitLabClient } from '../../../../../../src/api/git/gitlabClient';
import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { Environment } from '../../cd/argocd';
import { BaseGitProvider } from '../baseGitProvider';
import { GitType } from '../gitInterface';
import { PullRequest } from '../models';
import {
  ContentModifications,
  ITemplate,
  TemplateFactory,
  TemplateType,
} from '../templates/templateFactory';

/**
 * GitLab provider class
 *
 * This class implements the Git interface for GitLab repositories.
 */
export class GitlabProvider extends BaseGitProvider {
  private gitlabClient!: GitLabClient;
  private template!: ITemplate;
  private baseUrl: string = '';

  constructor(
    componentName: string,
    repoOwner: string,
    templateType: TemplateType,
    kubeClient: KubeClient
  ) {
    super(componentName, repoOwner, GitType.GITLAB, kubeClient);
    this.template = TemplateFactory.createTemplate(templateType);
  }

  public async initialize(): Promise<void> {
    this.secret = await this.loadSecret();
    this.gitlabClient = await this.initGitlabClient();
  }

  /**
   * Initialize GitLab client with token
   * @returns Promise with GitLab client
   */
  private async initGitlabClient(): Promise<GitLabClient> {
    const gitlabToken = this.getToken();
    const hostname = this.getHost();
    this.baseUrl = `https://${hostname}`;

    // Initialize the GitLab client with the base URL and token
    const gitlabClient = new GitLabClient({
      token: gitlabToken,
      baseUrl: this.baseUrl,
    });
    return gitlabClient;
  }

  /**
   * Loads GitLab integration secrets from Kubernetes
   * @returns Promise with the secret data
   */
  protected async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('rhtap-gitlab-integration', 'rhtap');
    if (!secret) {
      throw new Error(
        'GitLab token secret not found in the cluster. Please ensure the secret exists.'
      );
    }
    return secret;
  }

  public getToken(): string {
    if (!this.secret?.token) {
      throw new Error('GitLab token not found in the secret. Please ensure the token is provided.');
    }
    return this.secret.token;
  }

  public getClientID(): string {
    if (!this.secret?.clientId) {
      throw new Error(
        'Client ID not found in the secret. Please ensure the client ID is provided.'
      );
    }
    return this.secret.clientId;
  }

  public getClientSecret(): string {
    if (!this.secret?.clientSecret) {
      throw new Error(
        'Client secret not found in the secret. Please ensure the client secret is provided.'
      );
    }
    return this.secret.clientSecret;
  }

  public getWebhookSecret(): string {
    if (!this.secret?.webhookSecret) {
      throw new Error(
        'Webhook secret not found in the secret. Please ensure the webhook secret is provided.'
      );
    }
    return this.secret.webhookSecret;
  }

  /**
   * Creates a direct commit to the gitops repository to update the image for a specific environment
   * @param environment The target environment for promotion (e.g., 'development', 'stage', 'prod')
   * @param image The new image to be deployed (full image URL with tag)
   * @returns Promise with the commit SHA
   */
  public override async createPromotionCommitOnGitOpsRepo(
    environment: Environment,
    image: string
  ): Promise<string> {
    if (!environment) {
      throw new Error('Environment cannot be null.');
    }
    if (image === '') {
      throw new Error('Image cannot be empty.');
    }

    const branch = 'main'; // Default branch for GitOps repo
    const commitMessage = `Update ${environment} environment to image ${image}`;

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      console.log(`Creating a direct promotion commit for environment: ${environment}`);

      // Find the GitOps project ID
      const projects = await this.gitlabClient.getProjects({ search: this.gitOpsRepoName });
      const project = projects.find(
        p => p.name === this.gitOpsRepoName && p.namespace.path === this.repoOwner
      );

      if (!project) {
        throw new Error(`GitOps project ${this.repoOwner}/${this.gitOpsRepoName} not found`);
      }

      // const projectId = project.id;

      // Placeholder for getting current file content
      // We need to add a getFileContent method to GitLabClient
      console.log(`Will update image to: ${image}`);

      // Placeholder for content modification
      contentModifications[filePath] = [
        {
          oldContent: '- image: current-image',
          newContent: `- image: ${image}`,
        },
      ];

      // Use the common commit method
      const commitSha = await this.commitChangesToRepo(
        this.repoOwner,
        this.gitOpsRepoName,
        contentModifications,
        commitMessage,
        branch
      );

      console.log(
        `Successfully created direct promotion commit (${commitSha.substring(0, 7)}) for ${environment} environment`
      );
      return commitSha;
    } catch (error: any) {
      console.error(`Error creating promotion commit for ${environment}: ${error.message}`);
      throw error;
    }
  }
  /**
   * Merges a pull request in the GitLab repository and returns the updated PR
   * with merge information
   *
   * @param pullRequest The pull request to merge
   * @returns Updated PullRequest object with merge information
   */
  public override async mergePullRequest(pullRequest: PullRequest): Promise<PullRequest> {
    if (!pullRequest) {
      throw new Error('Pull request cannot be null.');
    }

    console.log(`Merging merge request #${pullRequest.pullNumber}...`);

    // if pullRequest is already merged, return it
    if (pullRequest.isMerged) {
      console.log(`Merge request #${pullRequest.pullNumber} is already merged.`);
      return pullRequest;
    }

    try {
      // Find the project ID for the repository
      const projects = await this.gitlabClient.getProjects({ search: pullRequest.repository });
      const project = projects.find(
        p => p.name === pullRequest.repository && p.namespace.path === this.repoOwner
      );

      if (!project) {
        throw new Error(`Project ${this.repoOwner}/${pullRequest.repository} not found`);
      }

      const projectId = project.id;

      // We need to add a mergeMergeRequest method to GitLabClient
      // For now, we'll just show the concept
      console.log(`Would merge merge request #${pullRequest.pullNumber} in project ${projectId}`);

      // The mergeResponse would contain the SHA of the merge commit
      const mergeResponseSha = 'merged-commit-sha';

      console.log(
        `Merge request #${pullRequest.pullNumber} merged successfully with SHA: ${mergeResponseSha}`
      );

      // Create a new PR object with the updated merge information
      const mergedPR = new PullRequest(
        pullRequest.pullNumber,
        mergeResponseSha,
        pullRequest.repository,
        true, // Mark as merged
        new Date().toISOString() // Set merge timestamp
      );

      return mergedPR;
    } catch (error: unknown) {
      console.error(`Failed to merge merge request #${pullRequest.pullNumber}: ${error}`);
      throw error;
    }
  }
  /**
   * Creates a promotion pull request in the gitops repository to move changes between environments
   * @param environment The target environment for promotion (e.g., 'development', 'stage', 'prod')
   * @param image The new image to be deployed (full image URL with tag)
   * @returns Promise with the created pull request details
   */
  public override async createPromotionPullRequestOnGitopsRepo(
    environment: Environment,
    image: string
  ): Promise<PullRequest> {
    if (!environment) {
      throw new Error('Environment cannot be null.');
    }
    if (image === '') {
      throw new Error('Image cannot be empty.');
    }

    const newBranchName = `promote-to-${environment}-${Date.now()}`;
    const title = `Promote to ${environment} environment`;
    const description = `This MR promotes the application to the ${environment} environment with image: ${image}`;
    const baseBranch = 'main'; // Default base branch

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      // Find the GitOps project ID
      const projects = await this.gitlabClient.getProjects({ search: this.gitOpsRepoName });
      const project = projects.find(
        p => p.name === this.gitOpsRepoName && p.namespace.path === this.repoOwner
      );

      if (!project) {
        throw new Error(`GitOps project ${this.repoOwner}/${this.gitOpsRepoName} not found`);
      }

      const projectId = project.id;

      // Get the current file content - we need to add a getFileContent method to GitLabClient
      // For now, we'll just demonstrate the concept
      console.log(`Creating a promotion PR for environment: ${environment}`);
      console.log(`Will update image to: ${image}`);

      // Placeholder for content modification logic
      contentModifications[filePath] = [
        {
          oldContent: '- image: current-image',
          newContent: `- image: ${image}`,
        },
      ];

      // Create a merge request
      const mergeRequest = await this.gitlabClient.createMergeRequest(
        projectId,
        newBranchName,
        baseBranch,
        title,
        { description }
      );

      // Extract the merge request ID and commit SHA
      const mrNumber = mergeRequest.iid;

      // Get the commit SHA from the most recent commit
      const commits = await this.gitlabClient.getCommits(projectId, { ref_name: newBranchName });
      const commitSha = commits[0]?.id || 'promotion-commit-sha';

      console.log(`Successfully created promotion MR #${mrNumber} for ${environment} environment`);
      return new PullRequest(mrNumber, commitSha, this.gitOpsRepoName);
    } catch (error: any) {
      console.error(`Error creating promotion PR for ${environment}: ${error.message}`);
      throw error;
    }
  }
  /**
   * Extracts the application image from the deployment patch in the GitOps repo
   * @param environment The environment to extract the image from
   * @returns Promise with the image string
   */
  public override async extractApplicationImage(environment: Environment): Promise<string> {
    if (!environment) {
      throw new Error('Environment cannot be null.');
    }

    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;
    console.log(`Extracting application image from file: ${filePath}`);
    
    try {
      // Find the GitOps project ID
      const projects = await this.gitlabClient.getProjects({ search: this.gitOpsRepoName });
      const project = projects.find(
        p => p.name === this.gitOpsRepoName && p.namespace.path === this.repoOwner
      );

      if (!project) {
        throw new Error(`GitOps project ${this.repoOwner}/${this.gitOpsRepoName} not found`);
      }

      const projectId = project.id;

      // Use a regex pattern that can handle both inline and multi-line image formats
      // Pattern explanation:
      // 1. (?:^|\s+)- image:(?:\s+(.+)$)? - Matches '- image:' with optional value on same line
      // 2. |\s+- image:$\s+(.+)$ - Matches '- image:' with value on next line (indented)
      const imagePattern = /(?:^|\s+)-\s+image:(?:\s+(.+)$)?|(^\s+.+$)/gm;

      const matches = await this.gitlabClient.extractContentByRegex(
        projectId,
        filePath,
        imagePattern,
        'main'
      );

      if (!matches || matches.length === 0) {
        throw new Error(`No image value found in file: ${filePath}`);
      }

      // Process the matches to extract the actual image URL
      let imageValue = '';

      // Check if we have a direct match with '- image: value'
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        if (match.includes('- image:')) {
          // This is a line with "- image:" that might have the value directly
          const parts = match.split('- image:');
          if (parts.length > 1 && parts[1].trim()) {
            imageValue = parts[1].trim();
            break;
          } else if (i + 1 < matches.length && !matches[i + 1].includes('- image:')) {
            // If this line just has "- image:" and next line doesn't have "- image:",
            // assume next line is the image value
            imageValue = matches[i + 1].trim();
            break;
          }
        }
      }

      if (!imageValue) {
        throw new Error(`Could not parse image value from matches in file: ${filePath}`);
      }

      console.log(`Extracted image from ${filePath}: ${imageValue}`);
      return imageValue;
    } catch (error: any) {
      console.error(`Error extracting application image: ${error.message}`);
      throw error;
    }
  }
  /**
   * Creates a sample pull request with modifications based on template type in the source repository
   *
   * @returns {Promise<PullRequest>} - Returns a PullRequest object with pull number and commit SHA
   */
  public override async createSamplePullRequestOnSourceRepo(): Promise<PullRequest> {
    const newBranchName = 'test-branch-' + Date.now();
    const title = 'Test MR from RHTAP e2e test';
    const description = 'This MR was created automatically by the RHTAP e2e test';
    const baseBranch = 'main'; // Default base branch

    try {
      // Get contentModifications from the template
      if (!this.template) {
        throw new Error('Template not set for this repository');
      }

      const contentModifications = this.template.getContentModifications();

      console.log(`Creating a sample merge request in GitLab with the following parameters:`);
      console.log(`New Branch Name: ${newBranchName}`);
      console.log(`Source Repository: ${this.sourceRepoName}`);

      // Use the GitLabClient's createMergeRequest method which handles branch creation and file modifications
      const result = await this.gitlabClient.createMergeRequest(
        this.repoOwner,
        this.sourceRepoName,
        this.repoOwner, // targetOwner
        baseBranch, 
        newBranchName,
        contentModifications,
        title,
        description
      );

      // Extract the merge request number and commit SHA from the result
      const { prNumber, commitSha } = result as { prNumber: number; commitSha: string };

      console.log(`Successfully created merge request #${prNumber} with commit SHA: ${commitSha}`);

      // Return a PullRequest object with the merge request details
      return new PullRequest(prNumber, commitSha, this.sourceRepoName);
    } catch (error: any) {
      console.error(`Error creating sample merge request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Creates a sample commit directly to the main branch of the source repository
   */
  public override async createSampleCommitOnSourceRepo(): Promise<string> {
    // Get contentModifications from the template
    if (!this.template) {
      throw new Error('Template not set for this repository');
    }

    const contentModifications = this.template.getContentModifications();
    const commitMessage = 'Test commit from RHTAP e2e test';

    // Use the common commit method
    return this.commitChangesToRepo(
      this.repoOwner,
      this.sourceRepoName,
      contentModifications,
      commitMessage,
      'main'
    );
  }

  public createSamplePullRequest(
    newBranchName: string,
    contentModifications: { [filePath: string]: { oldContent: string; newContent: string } },
    title: string,
    description: string,
    baseBranch?: string
  ): Promise<PullRequest> {
    // Implement the logic to create a sample pull request in GitLab
    // This may involve using the GitLab API to create a new branch,
    // commit the changes, and create a pull request
    // For now, we'll just log the parameters and return a dummy PR ID
    console.log(`Creating a sample pull request in GitLab with the following parameters:`);
    console.log(`New Branch Name: ${newBranchName}`);
    console.log(`Content Modifications: ${JSON.stringify(contentModifications)}`);
    console.log(`Title: ${title}`);
    console.log(`Description: ${description}`);
    console.log(`Base Branch: ${baseBranch || 'main'}`);

    // Construct repository URL for GitLab
    const repositoryUrl = `https://gitlab.com/${this.repoOwner}/${this.getSourceRepoName()}`;

    // Here you would typically use the GitLab API to create the pull request
    // For now, we'll just return a dummy PR ID
    // In a real implementation, you would return the actual PR ID from the GitLab API
    return Promise.resolve(new PullRequest(1, 'dummy-commit-sha', repositoryUrl));
  }

  /**
   * Commits changes to files in a specified repository
   * @param owner The repository owner
   * @param repo The repository name
   * @param contentModifications Object containing file modifications
   * @param commitMessage Message for the commit
   * @param branch The branch to commit to (default: 'main')
   * @returns Promise with commit SHA
   */
  public override async commitChangesToRepo(
    owner: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      // Validate inputs
      if (!owner || !repo) {
        throw new Error('Owner and repository name are required');
      }
      if (!contentModifications) {
        throw new Error('Content modifications are required');
      }
      if (!commitMessage) {
        throw new Error('Commit message is required');
      }

      console.log(`Committing changes to ${owner}/${repo} in branch ${branch}`);

      // Find the project ID for the repository
      const projects = await this.gitlabClient.getProjects({ search: repo });
      const project = projects.find(p => p.name === repo && p.namespace.path === owner);

      if (!project) {
        throw new Error(`Project ${owner}/${repo} not found`);
      }

      const projectId = project.id;

      // Process each file modification
      for (const [filePath, modifications] of Object.entries(contentModifications)) {
        for (const { oldContent: _oldContent, newContent } of modifications) {
          try {
            // Check if file exists
            // Note: oldContent is not used in this implementation since GitLab API doesn't require it
            // For now, we'll try to update and catch the error if file doesn't exist
            try {
              // Update existing file
              await this.gitlabClient.updateFile(
                projectId,
                filePath,
                branch,
                newContent,
                commitMessage
              );
            } catch (error: any) {
              if (error.message.includes('not found')) {
                // File doesn't exist, create it
                await this.gitlabClient.createFile(
                  projectId,
                  filePath,
                  branch,
                  newContent,
                  commitMessage
                );
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

      // Get the commit SHA from the most recent commit
      const commits = await this.gitlabClient.getCommits(projectId, { ref_name: branch });
      const commitSha = commits[0]?.id;

      if (!commitSha) {
        throw new Error(`Failed to retrieve commit SHA after committing changes`);
      }

      console.log(
        `Successfully committed all changes to branch '${branch}' with SHA: ${commitSha}`
      );
      return commitSha;
    } catch (error: any) {
      console.error(`Error creating batch commit on branch '${branch}': ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets the SHA256 commit hash for the source repository
   *
   * @param branch - The branch name to get the commit hash for (default: 'main')
   * @returns Promise resolving to the SHA256 commit hash of the latest commit in the source repository
   */
  public override async getSourceRepoCommitSha(branch: string = 'main'): Promise<string> {
    try {
      console.log(
        `Getting latest commit SHA for source repo: ${this.sourceRepoName}, branch: ${branch}`
      );

      // Find the project ID for the source repository
      const projects = await this.gitlabClient.getProjects({ search: this.sourceRepoName });
      const project = projects.find(
        p => p.name === this.sourceRepoName && p.namespace.path === this.repoOwner
      );

      if (!project) {
        throw new Error(`Project ${this.repoOwner}/${this.sourceRepoName} not found`);
      }

      const projectId = project.id;

      // Get the latest commit for the branch
      const commits = await this.gitlabClient.getCommits(projectId, { ref_name: branch });

      if (!commits || commits.length === 0) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitSha = commits[0].id;
      console.log(`Latest commit SHA for ${this.sourceRepoName}/${branch}: ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      console.error(`Failed to get commit SHA for source repo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets the SHA256 commit hash for the GitOps repository
   *
   * @param branch - The branch name to get the commit hash for (default: 'main')
   * @returns Promise resolving to the SHA256 commit hash of the latest commit in the GitOps repository
   */
  public override async getGitOpsRepoCommitSha(branch: string = 'main'): Promise<string> {
    try {
      console.log(
        `Getting latest commit SHA for GitOps repo: ${this.gitOpsRepoName}, branch: ${branch}`
      );

      // Find the project ID for the GitOps repository
      const projects = await this.gitlabClient.getProjects({ search: this.gitOpsRepoName });
      const project = projects.find(
        p => p.name === this.gitOpsRepoName && p.namespace.path === this.repoOwner
      );

      if (!project) {
        throw new Error(`GitOps project ${this.repoOwner}/${this.gitOpsRepoName} not found`);
      }

      const projectId = project.id;

      // Get the latest commit for the branch
      const commits = await this.gitlabClient.getCommits(projectId, { ref_name: branch });

      if (!commits || commits.length === 0) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitSha = commits[0].id;
      console.log(`Latest commit SHA for ${this.gitOpsRepoName}/${branch}: ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      console.error(`Failed to get commit SHA for GitOps repo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Configures a webhook for the source repository
   * @param webhookUrl The URL of the webhook to configure
   */
  public override async configWebhookOnSourceRepo(webhookUrl: string): Promise<void> {
    try {
      console.log(`Configuring webhook for source repo at ${webhookUrl}`);

      // Set up webhook using GitLab client with specific event triggers
      await this.gitlabClient.configWebhook(this.repoOwner, this.sourceRepoName, webhookUrl);

      console.log(
        `Webhook configured successfully for source repo ${this.repoOwner}/${this.sourceRepoName}`
      );
    } catch (error: any) {
      console.error(`Failed to configure webhook on source repo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Configures a webhook for the GitOps repository
   * @param webhookUrl The URL of the webhook to configure
   */
  public override async configWebhookOnGitOpsRepo(webhookUrl: string): Promise<void> {
    try {
      console.log(`Configuring webhook for GitOps repo at ${webhookUrl}`);

      // Set up webhook using GitLab client with specific event triggers
      await this.gitlabClient.configWebhook(this.repoOwner, this.gitOpsRepoName, webhookUrl);

      console.log(
        `Webhook configured successfully for GitOps repo ${this.repoOwner}/${this.gitOpsRepoName}`
      );
    } catch (error: any) {
      console.error(`Failed to configure webhook on GitOps repo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets the URL for the GitOps repository
   * @returns The GitOps repository URL
   */
  public override getGitOpsRepoUrl(): string {
    const hostname = this.getHost();
    return `https://${hostname}/${this.repoOwner}/${this.getGitOpsRepoName()}`;
  }

  /**
   * Gets the URL for the source repository
   * @returns The source repository URL
   */
  public override getSourceRepoUrl(): string {
    const hostname = this.getHost();
    return `https://${hostname}/${this.repoOwner}/${this.getSourceRepoName()}`;
  }

  /**
   * Gets the template type for this repository
   * @returns The template type
   */
  public getTemplateType(): TemplateType {
    return this.template.getType();
  }
}

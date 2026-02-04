import { BitbucketClient } from '../../../../../api/bitbucket';
import { Environment } from '../../cd/argocd';
import { BaseGitProvider } from '../baseGitProvider';
import { GitType } from '../gitInterface';
import { PullRequest } from '../models';
import { ContentModifications } from '../../../../modification/contentModification';

import { ITemplate, TemplateFactory, TemplateType } from '../templates/templateFactory';
import { KubeClient } from '../../../../../api/ocp/kubeClient';
import { LoggerFactory, Logger } from '../../../../../logger/logger';

/**
 * Bitbucket provider class
 *
 * This class implements the Git interface for Bitbucket repositories.
 */
export class BitbucketProvider extends BaseGitProvider {
  private readonly logger: Logger;
  private workspace: string;
  private project: string;
  private bitbucketClient!: BitbucketClient;
  private template!: ITemplate;

  /**
   * Get the host domain for Bitbucket URLs from the secret
   * @returns The host domain for Bitbucket URLs (defaults to 'bitbucket.org' if not specified in secret)
   */
  public getHost(): string {
    if (!this.secret?.host) {
      throw new Error(
        'Bitbucket host not found in the secret. Please ensure the host is provided.'
      );
    }
    return this.secret.host;
  }

  constructor(
    componentName: string,
    // repoOwner: string,
    workspace: string,
    project: string,
    kubeClient: KubeClient,
    templateType: TemplateType
  ) {
    super(componentName, GitType.BITBUCKET, kubeClient);
    this.logger = LoggerFactory.getLogger('rhtap.core.integration.git.bitbucket');
    this.workspace = workspace;
    this.project = project;
    this.template = TemplateFactory.createTemplate(templateType);
  }

  public async initialize(): Promise<void> {
    this.secret = await this.loadSecret();
    this.bitbucketClient = await this.initBitbucketClient();
  }

  /**
   * Initializes a Bitbucket client with the appropriate credentials
   * @returns Initialized BitbucketClient
   */
  private async initBitbucketClient(): Promise<BitbucketClient> {
    const username = this.getUsername();
    const appPassword = this.getAppPassword();

    // Using the default baseUrl from BitbucketClient for Bitbucket Cloud
    const bitbucketClient = new BitbucketClient({
      username: username,
      appPassword: appPassword,
    });

    return bitbucketClient;
  }

  /**
   * Loads Bitbucket integration secrets from Kubernetes
   * @returns Promise with the secret data
   */
  protected async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-bitbucket-integration', 'tssc');
    if (!secret) {
      throw new Error(`Secret tssc-bitbucket-integration not found`);
    }
    return secret;
  }

  public getWorkspace(): string {
    return this.workspace;
  }

  public getProject(): string {
    return this.project;
  }

  public getUsername(): string {
    if (!this.secret?.username) {
      throw new Error(
        'Bitbucket username not found in the secret. Please ensure the username is provided.'
      );
    }
    return this.secret.username;
  }

  public getAppPassword(): string {
    if (!this.secret?.appPassword) {
      throw new Error(
        'Bitbucket app password not found in the secret. Please ensure the app password is provided.'
      );
    }
    return this.secret.appPassword;
  }

  public override async getFileContentInString(
    owner: string,
    repo: string,
    filePath: string,
    branch: string
  ): Promise<string> {
    try {
      // Get the content of the  file
      this.logger.info(`Getting File Contents of ${filePath} in repo ${repo}`);
      const fileContent = await this.bitbucketClient.repositories.getFileContent(owner, repo, filePath, branch);

      if (!fileContent) {
        throw new Error(`No content found in file: ${filePath}`);
      }

      return fileContent;
    } catch (error: any) {
      this.logger.error(`Error getting file contents of ${filePath} in repo ${repo}:{}`);
      throw error;
    }
  }

  public getToken(): string {
    if (!this.secret?.appPassword) {
      throw new Error(
        'Bitbucket token not found in the secret. Please ensure the token is provided.'
      );
    }
    return this.secret.token;
  }

  /**
   * Creates a sample pull request in the specified repository
   *
   * @param newBranchName - The name of the branch to create
   * @param contentModifications - Files to modify
   * @param title - Title of the pull request
   * @param description - Description of the pull request
   * @param baseBranch - Base branch to create the PR against (defaults to 'main')
   * @returns Promise with the created pull request
   */
  public async createSamplePullRequest(
    newBranchName: string,
    contentModifications: ContentModifications,
    title: string,
    description: string,
    baseBranch: string = 'main',
    repository: string
  ): Promise<PullRequest> {
    try {
      this.logger.info(`Creating a sample pull request in Bitbucket with the following parameters:`);
      this.logger.info(`Repository: ${repository}`);
      this.logger.info(`New Branch Name: ${newBranchName}`);
      this.logger.info(`Title: ${title}`);
      this.logger.info(`Description: ${description}`);
      this.logger.info(`Base Branch: ${baseBranch}`);

      // First create a branch using the Bitbucket API's refs endpoint
      // Get the latest commit on the base branch to use as the starting point
      const branches = await this.bitbucketClient.repositories.getBranches(
        this.workspace,
        repository
      );
      const branchInfo = branches.find(branch => branch.name === baseBranch);

      if (!branchInfo || !branchInfo.target || !branchInfo.target.hash) {
        throw new Error(`Could not find base branch ${baseBranch} or its commit hash`);
      }

      // Create a new branch using the API
      await this.bitbucketClient.repositories.createBranch(
        this.workspace,
        repository,
        newBranchName,
        branchInfo.target.hash
      );

      this.logger.info(`Created new branch ${newBranchName} from ${baseBranch}`);

      // Commit the changes to the new branch using our common method
      await this.commitChangesToRepo(
        this.getWorkspace(),
        repository,
        contentModifications,
        `Changes for pull request: ${title}`,
        newBranchName
      );

      // Create the pull request
      const pullRequestData = {
        title: title,
        source: { branch: { name: newBranchName } },
        destination: { branch: { name: baseBranch } },
        description: description,
        close_source_branch: true,
      };

      const prResult = await this.bitbucketClient.pullRequests.createPullRequest(
        this.workspace,
        repository,
        pullRequestData
      );

      // Get the latest commit on the branch
      const commits = await this.bitbucketClient.repositories.getCommits(this.workspace, repository);

      if (!commits || commits.length === 0) {
        throw new Error(`No commits found on branch ${newBranchName}`);
      }

      const commitSha = commits[0].hash;
      const prNumber = prResult.id;

      // Construct the pull request URL
      const prUrl = `https://${this.getHost()}/${this.workspace}/${repository}/pull-requests/${prNumber}`;

      this.logger.info(`Successfully created pull request #${prNumber} with commit SHA: ${commitSha}`);
      this.logger.info(`Pull request URL: ${prUrl}`);

      return new PullRequest(prNumber, commitSha, repository, false, undefined, prUrl);
    } catch (error: any) {
      this.logger.error(`Error creating sample pull request: {}`);
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
    const title = 'Test PR from TSSC e2e test';
    const description = 'This PR was created automatically by the TSSC e2e test';
    const baseBranch = 'main'; // Default base branch

    try {
      // Get contentModifications from the template
      if (!this.template) {
        throw new Error('Template not set for this repository');
      }

      const contentModifications = this.template.getContentModifications();

      this.logger.info(`Creating a sample pull request in Bitbucket with the following parameters:`);
      this.logger.info(`New Branch Name: ${newBranchName}`);
      this.logger.info(`Source Repository: ${this.sourceRepoName}`);

      // First create a branch using the Bitbucket API's refs endpoint
      // Get the latest commit on the base branch to use as the starting point
      const branches = await this.bitbucketClient.repositories.getBranches(
        this.workspace,
        this.sourceRepoName
      );
      const branchInfo = branches.find(branch => branch.name === baseBranch);

      if (!branchInfo || !branchInfo.target || !branchInfo.target.hash) {
        throw new Error(`Could not find base branch ${baseBranch} or its commit hash`);
      }

      // Create a new branch using the API
      await this.bitbucketClient.repositories.createBranch(
        this.workspace,
        this.sourceRepoName,
        newBranchName,
        branchInfo.target.hash
      );

      this.logger.info(`Created new branch ${newBranchName} from ${baseBranch}`);

      // Commit the changes to the new branch
      // We need to use a different approach since Bitbucket API works differently
      // For each file in contentModifications, we'll update it directly
      for (const [filePath, modifications] of Object.entries(contentModifications)) {
        for (const { oldContent, newContent } of modifications) {
          try {
            // Determine the content to upload
            let fileContent = newContent;

            try {
              // Try to get existing content if the file exists
              const existingContent = await this.getFileContentInString(
                this.workspace,
                this.sourceRepoName,
                filePath,
                newBranchName
              );

              // If we get here, the file exists, apply the modification
              if (existingContent && oldContent) {
                // Simple replacement; in a real implementation you might want a more sophisticated diff algorithm
                fileContent = existingContent.replace(oldContent, newContent);
              }
            } catch (error) {
              // File probably doesn't exist, we'll create it with the new content
              this.logger.info(`File ${filePath} not found, will create it`);
            }

            // Upload the file via the src endpoint
            // In Bitbucket API we can't easily do atomic multi-file commits through the REST API
            // We'll do individual file updates
            const commitData = {
              branch: newBranchName,
              message: `Update ${filePath}`,
              [filePath]: fileContent,
            };

            await this.bitbucketClient.repositories.createCommit(
              this.workspace,
              this.sourceRepoName,
              commitData
            );

            this.logger.info(`Updated file ${filePath} on branch ${newBranchName}`);
          } catch (error: any) {
            this.logger.error(`Error updating file ${filePath}: {}`);
            throw error;
          }
        }
      }

      // Create the pull request
      const pullRequestData = {
        title: title,
        source: { branch: { name: newBranchName } },
        destination: { branch: { name: baseBranch } },
        description: description,
        close_source_branch: true,
      };

      const prResult = await this.bitbucketClient.pullRequests.createPullRequest(
        this.workspace,
        this.sourceRepoName,
        pullRequestData
      );

      // Get the latest commit on the branch
      const commits = await this.bitbucketClient.repositories.getCommits(this.workspace, this.sourceRepoName);

      const commitSha = commits[0]?.hash || 'unknown-commit-sha';
      const prNumber = prResult.id;

      // Construct the pull request URL
      const prUrl = `https://${this.getHost()}/${this.workspace}/${this.sourceRepoName}/pull-requests/${prNumber}`;

      this.logger.info(`Successfully created pull request #${prNumber} with commit SHA: ${commitSha}`);
      this.logger.info(`Pull request URL: ${prUrl}`);

      return new PullRequest(prNumber, commitSha, this.sourceRepoName, false, undefined, prUrl);
    } catch (error: any) {
      this.logger.error(`Error creating sample pull request: {}`);
      throw error;
    }
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
    workspace: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      if (!workspace || !repo) {
        throw new Error('Workspace and repository name are required');
      }
      if (!contentModifications) {
        throw new Error('Content modifications are required');
      }
      if (!commitMessage) {
        throw new Error('Commit message is required');
      }

      this.logger.info(`Committing changes to ${workspace}/${repo} in branch ${branch}`);

      // Create an object to hold the files for the /src endpoint
      const files: Record<string, string> = {};

      // Process each file modification
      for (const [filePath, modifications] of Object.entries(contentModifications)) {
        let fileContent: string = '';
        
        for (const { oldContent, newContent } of modifications) {
          try {
            // Get the current file content to apply the modifications
            try {
              // Try to get existing content
              fileContent = await this.getFileContentInString(
                this.workspace,
                repo,
                filePath,
                branch
              );

              // If we have old content and it exists in the file, replace it with new content
              if (typeof fileContent === 'string' && oldContent) {
                let contentExists = false;
                if (typeof oldContent === 'string') {
                  contentExists = fileContent.includes(oldContent);
                } else if (oldContent instanceof RegExp) {
                  contentExists = oldContent.test(fileContent);
                }
                
                if (contentExists) {
                  fileContent = fileContent.replace(oldContent, newContent);
                } else {
                  // Can't find the old content or the response format is unexpected
                  this.logger.info(
                    `Could not find old content in ${filePath}, using new content directly`
                  );
                  fileContent = newContent;
                }
              }
            } catch (error) {
              // File may not exist, use new content directly
              this.logger.info(`Error getting file ${filePath}, using new content directly: ${error}`);
              fileContent = newContent;
            }
          } catch (error: any) {
            this.logger.error(`Error modifying file ${filePath}: {}`);
            throw error;
          }
        }
        
        // Add to the files object for committing
        files[filePath] = fileContent;
      }

      // In Bitbucket REST API, we use the /src endpoint to commit files
      // Setup the commit data
      const formData: Record<string, any> = {
        branch: branch,
        message: commitMessage,
        ...files,
      };

      // Make the commit via the API
      await this.bitbucketClient.repositories.createCommit(
        this.workspace,
        repo,
        formData
      );

      // Get the latest commit SHA for the branch
      const commits = await this.bitbucketClient.repositories.getCommits(this.workspace, repo);

      if (!commits || commits.length === 0) {
        throw new Error(`Failed to retrieve commits after changes`);
      }

      const commitSha = commits[0].hash;

      this.logger.info(
        `Successfully committed all changes to branch '${branch}' with SHA: ${commitSha}`
      );
      return commitSha;
    } catch (error: any) {
      this.logger.error(`Error creating batch commit on branch '${branch}': {}`);
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
      this.logger.info(
        `Getting latest commit SHA for source repo: ${this.sourceRepoName}, branch: ${branch}`
      );

      const commits = await this.bitbucketClient.repositories.getCommits(this.workspace, this.sourceRepoName);

      if (!commits || commits.length === 0) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitSha = commits[0].hash;
      this.logger.info(`Latest commit SHA for ${this.sourceRepoName}/${branch}: ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      this.logger.error(`Failed to get commit SHA for source repo: {}`);
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
      this.logger.info(
        `Getting latest commit SHA for GitOps repo: ${this.gitOpsRepoName}, branch: ${branch}`
      );

      const commits = await this.bitbucketClient.repositories.getCommits(this.workspace, this.gitOpsRepoName);

      if (!commits || commits.length === 0) {
        throw new Error(`No commits found for branch ${branch}`);
      }

      const commitSha = commits[0].hash;
      this.logger.info(`Latest commit SHA for ${this.gitOpsRepoName}/${branch}: ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      this.logger.error(`Failed to get commit SHA for GitOps repo: {}`);
      throw error;
    }
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
    const branch = 'main'; // Default branch for GitOps repo
    const commitMessage = `Update ${environment} environment to deploy image ${image}`;

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      this.logger.info(`Creating a direct promotion commit for environment: ${environment}`);

      // Get the current content of the deployment patch file
      const fileContent = await this.getFileContentInString(
        this.workspace,
        this.gitOpsRepoName,
        filePath,
        branch
      );

      // Parse the content to find the current image line
      const lines = fileContent.split('\n');
      let imageLineIndex = -1;
      let oldImageLine = '';

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('- image:')) {
          imageLineIndex = i;
          oldImageLine = lines[i];
          break;
        }
      }

      if (imageLineIndex === -1) {
        throw new Error(`Could not find image line in file: ${filePath}`);
      }

      // Create the new image line with the same indentation
      const indentation = oldImageLine.match(/^\s*/)?.[0] || '';
      const newImageLine = `${indentation}- image: ${image}`;

      // Add the modification
      contentModifications[filePath] = [
        {
          oldContent: oldImageLine,
          newContent: newImageLine,
        },
      ];

      this.logger.info(`Will update image from "${oldImageLine.trim()}" to "${newImageLine.trim()}"`);

      // Create a direct commit with the changes
      const commitSha = await this.commitChangesToRepo(
        this.getWorkspace(),
        this.gitOpsRepoName,
        contentModifications,
        commitMessage,
        branch
      );

      this.logger.info(
        `Successfully created direct promotion commit (${commitSha.substring(0, 7)}) for ${environment} environment`
      );
      return commitSha;
    } catch (error: any) {
      this.logger.error(`Error creating promotion commit for ${environment}: {}`);
      throw error;
    }
  }

  /**
   * Merges a pull request in the Bitbucket repository and returns the updated PR
   * with merge information
   *
   * @param pullRequest The pull request to merge
   * @returns Updated PullRequest object with merge information
   */
  public override async mergePullRequest(pullRequest: PullRequest): Promise<PullRequest> {
    this.logger.info(`Merging pull request #${pullRequest.pullNumber}...`);
    // if pullRequest is already merged, return it
    if (pullRequest.isMerged) {
      this.logger.info(`Pull request #${pullRequest.pullNumber} is already merged.`);
      return pullRequest;
    }

    try {
      // Extract repo name from the pullRequest.repository
      const repoName = pullRequest.repository;

      // Call the Bitbucket API to merge the PR using our dedicated method
      const mergeResponse = await this.bitbucketClient.pullRequests.mergePullRequest(
        this.workspace,
        repoName,
        pullRequest.pullNumber,
        {
          close_source_branch: true,
          message: 'Merged via TSSC e2e test',
          merge_strategy: 'merge_commit',
        }
      );

      if (!mergeResponse || !mergeResponse.merge_commit) {
        throw new Error(
          `Merge succeeded but didn't return a commit SHA for PR #${pullRequest.pullNumber}`
        );
      }

      this.logger.info(
        `Pull request #${pullRequest.pullNumber} merged successfully with SHA: ${mergeResponse.merge_commit.hash}`
      );

      // Create a new PR object with the updated merge information
      const mergedPR = new PullRequest(
        pullRequest.pullNumber,
        mergeResponse.merge_commit.hash, // Use the merge commit SHA
        pullRequest.repository,
        true, // Mark as merged
        new Date().toISOString(), // Set merge timestamp
        pullRequest.url // Preserve the original URL
      );

      return mergedPR;
    } catch (error: unknown) {
      this.logger.error(`Failed to merge pull request #${pullRequest.pullNumber}: ${error}`);
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
    const commitMessage = 'Test commit from TSSC e2e test';

    // Use the common commit method
    return this.commitChangesToRepo(
      this.getWorkspace(),
      this.sourceRepoName,
      contentModifications,
      commitMessage,
      'main'
    );
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
    const newBranchName = `promote-to-${environment}-${Date.now()}`;
    const title = `Promote to ${environment} environment`;
    const description = `This PR promotes the application to the ${environment} environment with image: ${image}`;
    const baseBranch = 'main'; // Default base branch

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      this.logger.info(`Creating a promotion PR for environment: ${environment}`);

      // Get the current content of the deployment patch file
      const fileContent = await this.getFileContentInString(
        this.workspace,
        this.gitOpsRepoName,
        filePath,
        baseBranch
      );

      // Parse the content to find the current image line
      const lines = fileContent.split('\n');
      let imageLineIndex = -1;
      let oldImageLine = '';

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('- image:')) {
          imageLineIndex = i;
          oldImageLine = lines[i];
          break;
        }
      }

      if (imageLineIndex === -1) {
        throw new Error(`Could not find image line in file: ${filePath}`);
      }

      // Create the new image line with the same indentation
      const indentation = oldImageLine.match(/^\s*/)?.[0] || '';
      const newImageLine = `${indentation}- image: ${image}`;

      // Add the modification
      contentModifications[filePath] = [
        {
          oldContent: oldImageLine,
          newContent: newImageLine,
        },
      ];

      this.logger.info(`Will update image from "${oldImageLine.trim()}" to "${newImageLine.trim()}"`);

      // Create a branch for this PR using the refs endpoint
      // Get the latest commit on the base branch to use as the starting point
      const branches = await this.bitbucketClient.repositories.getBranches(
        this.workspace,
        this.gitOpsRepoName
      );
      const branchInfo = branches.find(branch => branch.name === baseBranch);

      if (!branchInfo || !branchInfo.target || !branchInfo.target.hash) {
        throw new Error(`Could not find base branch ${baseBranch} or its commit hash`);
      }

      // Create a new branch using the API
      await this.bitbucketClient.repositories.createBranch(
        this.workspace,
        this.gitOpsRepoName,
        newBranchName,
        branchInfo.target.hash
      );

      this.logger.info(`Created new branch ${newBranchName} from ${baseBranch}`);

      // Commit the changes to the new branch
      await this.commitChangesToRepo(
        this.getWorkspace(),
        this.gitOpsRepoName,
        contentModifications,
        title,
        newBranchName
      );

      // Create the pull request
      const pullRequestData = {
        title: title,
        source: { branch: { name: newBranchName } },
        destination: { branch: { name: baseBranch } },
        description: description,
        close_source_branch: true,
      };

      const prResult = await this.bitbucketClient.pullRequests.createPullRequest(
        this.workspace,
        this.gitOpsRepoName,
        pullRequestData
      );

      // Get the latest commit on the branch
      const commits = await this.bitbucketClient.repositories.getCommits(this.workspace, this.gitOpsRepoName);

      const commitSha = commits[0]?.hash || 'unknown-commit-sha';
      const prNumber = prResult.id;

      // Construct the pull request URL
      const prUrl = `https://${this.getHost()}/${this.workspace}/${this.gitOpsRepoName}/pull-requests/${prNumber}`;

      this.logger.info(`Successfully created promotion PR #${prNumber} for ${environment} environment`);
      this.logger.info(`Pull request URL: ${prUrl}`);

      return new PullRequest(prNumber, commitSha, this.gitOpsRepoName, false, undefined, prUrl);
    } catch (error: any) {
      this.logger.error(`Error creating promotion PR for ${environment}: {}`);
      throw error;
    }
  }

  /**
   * Extract application image from deployment configuration
   * @param environment The environment to extract the image from
   * @returns Promise with the image string
   */
  public override async extractApplicationImage(environment: Environment): Promise<string> {
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;
    this.logger.info(`Extracting application image from file: ${filePath}`);

    try {
      // Get the file content
      const fileContent = await this.getFileContentInString(
        this.workspace,
        this.gitOpsRepoName,
        filePath,
        'main'
      );

      // Convert to string if needed
      const content = typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent);

      // Use a regex pattern to find the image value
      const imagePattern = /(?:^|\s+)-\s+image:(?:\s+(.+)$)?|(^\s+.+$)/gm;
      const matches = content.match(imagePattern);

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

      this.logger.info(`Extracted image from ${filePath}: ${imageValue}`);
      return imageValue;
    } catch (error: any) {
      this.logger.error(`Error extracting application image: {}`);
      throw error;
    }
  }

  /**
   * Configures webhook on the source repository for CI/CD integration
   * @param webhookUrl The URL that webhook events will be sent to
   * @returns Promise that resolves when the webhook is created
   */
  public override async configWebhookOnSourceRepo(webhookUrl: string): Promise<void> {
    try {
      this.logger.info(
        `Configuring webhook for source repo ${this.workspace}/${this.sourceRepoName} with ${webhookUrl}`
      );

      const events = [
        'pullrequest:created',
        'pullrequest:updated',
        'pullrequest:approved',
        'pullrequest:fulfilled',
        'repo:push',
      ];

      // Create the webhook via our dedicated method
      const response = await this.bitbucketClient.webhooks.createWebhook(
        this.workspace,
        this.sourceRepoName,
        webhookUrl,
        events,
        'TSSC Integration Webhook'
      );

      this.logger.info(
        `Successfully configured webhook for source repo ${this.workspace}/${this.sourceRepoName} with ID: ${response.uuid}`
      );
    } catch (error: any) {
      this.logger.error(`Failed to configure webhook for source repo: {}`);
      throw error;
    }
  }

  /**
   * Configures webhook on the GitOps repository for CI/CD integration
   * @param webhookUrl The URL that webhook events will be sent to
   * @returns Promise that resolves when the webhook is created
   */
  public override async configWebhookOnGitOpsRepo(webhookUrl: string): Promise<void> {
    try {
      this.logger.info(
        `Configuring webhook for GitOps repo ${this.workspace}/${this.gitOpsRepoName} at ${webhookUrl}`
      );

      const events = [
        'pullrequest:created',
        'pullrequest:updated',
        'pullrequest:approved',
        'pullrequest:fulfilled',
        'repo:push',
      ];

      // Create the webhook via our dedicated method
      const response = await this.bitbucketClient.webhooks.createWebhook(
        this.workspace,
        this.gitOpsRepoName,
        webhookUrl,
        events,
        'TSSC GitOps Integration Webhook'
      );

      this.logger.info(
        `Successfully configured webhook for GitOps repo ${this.workspace}/${this.gitOpsRepoName} with ID: ${response.uuid}`
      );
    } catch (error: any) {
      this.logger.error(`Failed to configure webhook for GitOps repo: {}`);
      throw error;
    }
  }

  public override getGitOpsRepoUrl(): string {
    return `https://${this.getHost()}/${this.workspace}/${this.gitOpsRepoName}`;
  }
  public override getSourceRepoUrl(): string {
    return `https://${this.getHost()}/${this.workspace}/${this.sourceRepoName}`;
  }

  /**
   * Gets the owner identifier for the repository
   * For Bitbucket, this is the workspace name
   * @returns The repository owner (workspace)
   */
  public override getRepoOwner(): string {
    return this.getWorkspace();
  }
}

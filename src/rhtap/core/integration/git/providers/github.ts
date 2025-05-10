import { GithubClient } from '../../../../../../src/api/git/githubClient';
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

export class GithubProvider extends BaseGitProvider {
  private githubClient!: GithubClient;
  private template!: ITemplate;

  public constructor(
    componentName: string,
    repoOwner: string,
    templateType: TemplateType,
    kubeClient: KubeClient
  ) {
    super(componentName, repoOwner, GitType.GITHUB, kubeClient);
    this.template = TemplateFactory.createTemplate(templateType);
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.secret = await this.loadSecret();
    this.githubClient = await this.initGithubClient();
  }

  /**
   * Loads GitHub integration secrets from Kubernetes
   * @returns Promise with the secret data
   */
  protected async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('rhtap-github-integration', 'rhtap');
    if (!secret) {
      throw new Error(
        'GitHub integration secret not found in the cluster. Please ensure the secret exists.'
      );
    }
    return secret;
  }

  public getToken(): string {
    if (!this.secret?.token) {
      throw new Error('GitHub token not found in the secret. Please ensure the token is provided.');
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

  // public getHostname(): string {
  //   if (!this.secret?.host) {
  //     throw new Error('Host not found in the secret. Please ensure the host is provided.');
  //   }
  //   return this.secret.host;
  // }

  public getWebhookSecret(): string {
    if (!this.secret?.webhookSecret) {
      throw new Error(
        'Webhook secret not found in the secret. Please ensure the webhook secret is provided.'
      );
    }
    return this.secret.webhookSecret;
  }

  private async initGithubClient(): Promise<GithubClient> {
    const githubToken = this.getToken();
    const githubClient = new GithubClient({
      token: githubToken,
    });
    return githubClient;
  }

  /**
   * Gets the template type for this repository
   * @returns The template type or null if not set
   */
  public getTemplateType(): TemplateType {
    return this.template.getType();
  }

  /**
   * Creates a sample pull request with modifications based on template type in the source repository
   *
   * @returns {Promise<PullRequest>} - Returns a PullRequest object with pull number and commit SHA
   */
  public override async createSamplePullRequestOnSourceRepo(): Promise<PullRequest> {
    const newBranchName = 'test-branch-' + Date.now();
    const title = 'Test PR from RHTAP e2e test';
    const description = 'This PR was created automatically by the RHTAP e2e test';
    const baseBranch = 'main'; // Default base branch

    // Get contentModifications from the template
    if (!this.template) {
      throw new Error('Template not set for this repository');
    }

    const contentModifications = this.template.getContentModifications();

    const result = await this.githubClient.createPullRequest(
      this.repoOwner,
      this.sourceRepoName,
      this.repoOwner,
      baseBranch,
      newBranchName,
      contentModifications,
      title,
      description
    );

    // Extract the pull number and commit SHA from the result
    const { prNumber, commitSha } = result;

    // Construct repository name for GitHub
    const repository = `${this.sourceRepoName}`;

    return new PullRequest(prNumber, commitSha, repository);
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
      // Get the current content of the deployment patch file
      const fileContent = await this.githubClient.getContent(
        this.repoOwner,
        this.gitOpsRepoName,
        filePath,
        baseBranch
      );

      if (!fileContent || !('content' in fileContent)) {
        throw new Error(`Could not retrieve content for file: ${filePath}`);
      }

      // Decode the content from base64
      const currentContent = Buffer.from(fileContent.content, 'base64').toString('utf-8');

      // Parse the content to find the current image line
      const lines = currentContent.split('\n');
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

      console.log(`Creating a promotion PR for environment: ${environment}`);
      console.log(`Will update image from "${oldImageLine.trim()}" to "${newImageLine.trim()}"`);

      // Create a PR with the changes
      const result = await this.githubClient.createPullRequest(
        this.repoOwner,
        this.gitOpsRepoName,
        this.repoOwner,
        baseBranch,
        newBranchName,
        contentModifications,
        title,
        description
      );

      // Extract the pull number and commit SHA from the result
      const { prNumber, commitSha } = result;

      console.log(`Successfully created promotion PR #${prNumber} for ${environment} environment`);
      return new PullRequest(prNumber, commitSha, this.gitOpsRepoName);
    } catch (error: any) {
      console.error(`Error creating promotion PR for ${environment}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Merges a pull request in the GitHub repository and returns the updated PR
   * with merge information
   *
   * @param pullRequest The pull request to merge
   * @returns Updated PullRequest object with merge information
   */
  public override async mergePullRequest(pullRequest: PullRequest): Promise<PullRequest> {
    console.log(`Merging pull request #${pullRequest.pullNumber}...`);
    // if pullRequest is already merged, return it
    if (pullRequest.isMerged) {
      console.log(`Pull request #${pullRequest.pullNumber} is already merged.`);
      return pullRequest;
    }

    try {
      // Call the GitHub API to merge the PR
      const mergeResponse = await this.githubClient.mergePullRequest(
        this.repoOwner,
        pullRequest.repository,
        pullRequest.pullNumber
      );

      if (!mergeResponse || !mergeResponse.sha) {
        throw new Error(
          `Merge succeeded but didn't return a commit SHA for PR #${pullRequest.pullNumber}`
        );
      }

      console.log(
        `Pull request #${pullRequest.pullNumber} merged successfully with SHA: ${mergeResponse.sha}`
      );

      // Create a new PR object with the updated merge information
      const mergedPR = new PullRequest(
        pullRequest.pullNumber,
        mergeResponse.sha, // Use the merge commit SHA
        pullRequest.repository,
        true, // Mark as merged
        new Date().toISOString() // Set merge timestamp
      );

      return mergedPR;
    } catch (error: unknown) {
      console.error(`Failed to merge pull request #${pullRequest.pullNumber}: ${error}`);
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
    owner: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      // Use batch commit method from githubClient to commit all changes at once
      // Now passing the branch parameter to the commit method
      const commitSha = await this.githubClient.commit(
        owner,
        repo,
        contentModifications,
        commitMessage,
        branch
      );

      console.log(
        `Successfully committed all changes in a batch commit to branch '${branch}' with SHA: ${commitSha}`
      );
      return commitSha;
    } catch (error: any) {
      console.error(`Error creating batch commit on branch '${branch}': ${error.message}`);
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
    const commitMessage = `Update ${environment} environment to image ${image}`;

    // The file path in the gitops repository to be modified
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;

    const contentModifications: ContentModifications = {};

    try {
      console.log(`Creating a direct promotion commit for environment: ${environment}`);

      // Get the current content of the deployment patch file
      const fileContent = await this.githubClient.getContent(
        this.repoOwner,
        this.gitOpsRepoName,
        filePath,
        branch
      );

      if (!fileContent || !('content' in fileContent)) {
        throw new Error(`Could not retrieve content for file: ${filePath}`);
      }

      // Decode the content from base64
      const currentContent = Buffer.from(fileContent.content, 'base64').toString('utf-8');

      // Parse the content to find the current image line
      const lines = currentContent.split('\n');
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

      console.log(`Will update image from "${oldImageLine.trim()}" to "${newImageLine.trim()}"`);

      // Create a direct commit with the changes
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

  public override async extractApplicationImage(environment: Environment): Promise<string> {
    const filePath = `components/${this.componentName}/overlays/${environment}/deployment-patch.yaml`;
    console.log(`Extracting application image from file: ${filePath}`);
    try {
      // Use a regex pattern that can handle both inline and multi-line image formats
      // Pattern explanation:
      // 1. (?:^|\s+)- image:(?:\s+(.+)$)? - Matches '- image:' with optional value on same line
      // 2. |\s+- image:$\s+(.+)$ - Matches '- image:' with value on next line (indented)
      const imagePattern = /(?:^|\s+)-\s+image:(?:\s+(.+)$)?|(^\s+.+$)/gm;

      const matches = await this.githubClient.extractContentByRegex(
        this.repoOwner,
        this.gitOpsRepoName,
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

      return await this.githubClient.getBranchCommitSha(
        this.repoOwner,
        this.sourceRepoName,
        branch
      );
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

      return await this.githubClient.getBranchCommitSha(
        this.repoOwner,
        this.gitOpsRepoName,
        branch
      );
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
      await this.githubClient.configWebhook(this.repoOwner, this.sourceRepoName, webhookUrl);
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
      await this.githubClient.configWebhook(this.repoOwner, this.gitOpsRepoName, webhookUrl);
    } catch (error: any) {
      console.error(`Failed to configure webhook on GitOps repo: ${error.message}`);
      throw error;
    }
  }

  public override getGitOpsRepoUrl(): string {
    return `https://${this.getHost()}/${this.repoOwner}/${this.gitOpsRepoName}`;
  }

  public override getSourceRepoUrl(): string {
    return `https://${this.getHost()}/${this.repoOwner}/${this.sourceRepoName}`;
  }
}

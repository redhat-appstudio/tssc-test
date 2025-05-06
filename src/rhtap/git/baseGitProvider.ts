import { Environment } from '../cd/argocd';
import { Git, GitType } from './gitInterface';
import { PullRequest } from './models';
import { ContentModifications } from './templates/templateFactory';

/**
 * Abstract base class for Git providers with common functionality
 */
export abstract class BaseGitProvider implements Git {
  gitType: GitType;
  protected sourceRepoName: string;
  protected gitOpsRepoName: string;
  protected componentName: string;

  constructor(
    componentName: string,
    public repoOwner: string,
    type: GitType
  ) {
    this.gitType = type;
    this.repoOwner = repoOwner;
    this.componentName = componentName;
    // Default initialization for source and gitops repo names
    this.sourceRepoName = componentName;
    this.gitOpsRepoName = `${componentName}-gitops`;
  }

  /**
   * Get the latest commit SHA from the source repository
   * @param branch The branch name to get the commit SHA from (default: 'main')
   * @returns Promise with the commit SHA
   */
  public abstract getSourceRepoCommitSha(branch?: string): Promise<string>;

  /**
   * Get the latest commit SHA from the GitOps repository
   * @param branch The branch name to get the commit SHA from (default: 'main')
   * @returns Promise with the commit SHA
   */
  public abstract getGitOpsRepoCommitSha(branch?: string): Promise<string>;

  public abstract createPromotionCommitOnGitOpsRepo(
    environment: Environment,
    image: string
  ): Promise<string>;

  public getGitType(): GitType {
    return this.gitType;
  }

  public getRepoOwner(): string {
    return this.repoOwner;
  }

  public getSourceRepoName(): string {
    return this.sourceRepoName;
  }

  public getGitOpsRepoName(): string {
    return this.gitOpsRepoName;
  }

  public createPullRequest(): void {
    throw new Error(`createPullRequest not implemented for ${this.gitType}`);
  }

  public abstract mergePullRequest(pullRequest: PullRequest): Promise<void>;
  /**
   * Creates a sample pull request with modifications to specified files in the source repository
   */
  public abstract createSamplePullRequestOnSourceRepo(): Promise<PullRequest>;

  /**
   * Creates a sample commit with modifications directly to the main branch of the source repository
   */
  public abstract createSampleCommitOnSourceRepo(): Promise<string>;

  /**
   * Creates a promotion pull request in the gitops repository
   * This is used for promoting changes between environments (dev → stage → prod)
   *
   * @param environment The target environment for promotion
   * @param image The image to promote
   */
  public abstract createPromotionPullRequestOnGitopsRepo(
    environment: string,
    image: string
  ): Promise<PullRequest>;

  /**
   * Commits changes to files in a specified repository
   * @param owner The repository owner
   * @param repo The repository name
   * @param contentModifications Object containing file modifications
   * @param commitMessage Message for the commit
   * @param branch The branch to commit to (default: 'main')
   * @returns Promise with commit SHA
   */
  public abstract commitChangesToRepo(
    owner: string,
    repo: string,
    contentModifications: ContentModifications,
    commitMessage: string,
    branch?: string
  ): Promise<string>;

  public abstract extractApplicationImage(environment: Environment): Promise<string>;
}

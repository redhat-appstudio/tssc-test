/**
 * Represents a pull request in a Git repository
 */
export class PullRequest {
  /**
   * Creates a new PullRequest instance
   * @param pullNumber The pull request number
   * @param sha The commit SHA associated with the pull request
   * @param repository The repository name
   * @param merged Whether the PR has been merged
   * @param mergedAt When the PR was merged (ISO date string)
   */
  constructor(
    public readonly pullNumber: number,
    public readonly sha: string,
    public readonly repository: string,
    public readonly isMerged: boolean = false,
    public readonly mergedAt?: string
  ) {}

  /**
   * Returns a string representation of this pull request
   */
  toString(): string {
    return `PR #${this.pullNumber} (${this.sha.substring(0, 7)})${this.isMerged ? ' [MERGED]' : ''}`;
  }
  
  /**
   * Creates a merged copy of this PR with updated SHA
   */
  withMergeInfo(mergeSha: string, mergedAt: string = new Date().toISOString()): PullRequest {
    return new PullRequest(
      this.pullNumber,
      mergeSha,
      this.repository,
      true,
      mergedAt
    );
  }
}
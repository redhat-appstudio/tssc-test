import { Octokit } from '@octokit/rest';
import { Buffer } from 'buffer';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import { GithubApiError, GithubNotFoundError } from '../errors/github.errors';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

/**
 * GitHub Pull Request Service
 * 
 * Provides comprehensive operations for managing GitHub pull requests including
 * creating, listing, merging, and managing pull request content modifications.
 * 
 * @example Basic Usage
 * ```typescript
 * import { GithubPullRequestService } from './github-pull-request.service';
 * 
 * const service = new GithubPullRequestService(octokit);
 * 
 * // List pull requests
 * const prs = await service.listPullRequests('owner', 'repo', 'open');
 * 
 * // Get specific pull request
 * const pr = await service.getPullRequest('owner', 'repo', 123);
 * 
 * // Create pull request
 * const newPr = await service.createPullRequest(
 *   'owner', 'repo', 'username', 'main', 'feature-branch',
 *   'PR Title', 'PR Description'
 * );
 * ```
 * 
 * @example Advanced Usage with Content Modifications
 * ```typescript
 * const contentModifications = {
 *   'src/app.js': [
 *     { oldContent: 'const API_URL = "old-url"', newContent: 'const API_URL = "new-url"' }
 *   ],
 *   'README.md': [
 *     { oldContent: /version: \d+\.\d+\.\d+/, newContent: 'version: 2.0.0' }
 *   ]
 * };
 * 
 * const pr = await service.createPullRequestWithModifications(
 *   'owner', 'repo', 'username', 'main', 'feature-branch',
 *   'Update API and version', 'Description', contentModifications
 * );
 * ```
 */
export class GithubPullRequestService {
  private readonly logger: Logger;

  /**
   * Creates a new GitHub Pull Request Service instance
   *
   * @param octokit The Octokit instance for GitHub API interactions
   */
  constructor(private readonly octokit: Octokit) {
    this.logger = LoggerFactory.getLogger('github.pull-request');
  }

  /**
   * Lists pull requests for a repository
   * 
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param state Pull request state filter ('open', 'closed', or 'all')
   * @returns Promise with array of pull request data
   * 
   * @example
   * ```typescript
   * const openPRs = await service.listPullRequests('microsoft', 'vscode', 'open');
   * const allPRs = await service.listPullRequests('facebook', 'react', 'all');
   * ```
   */
  public async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
  ) {
    try {
      const { data } = await this.octokit.pulls.list({
        owner,
        repo,
        state,
      });
      return data;
    } catch (error: any) {
      this.logger.error('Failed to list pull requests for {}/{}: {}', owner, repo, error);
      throw new GithubApiError(`Failed to list pull requests for ${owner}/${repo}`, error.status, error);
    }
  }

  public async getPullRequest(owner: string, repo: string, pullNumber: number) {
    try {
      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
      return data;
    } catch (error: any) {
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        this.logger.error('Pull request #{} not found in {}/{}', pullNumber, owner, repo);
        throw new GithubNotFoundError('pull request', `#${pullNumber} in ${owner}/${repo}`, error.status || 404);
      }
      this.logger.error('Failed to get pull request #{} for {}/{}: {}', pullNumber, owner, repo, error);
      throw new GithubApiError(`Failed to get pull request #${pullNumber} for ${owner}/${repo}`, error.status, error);
    }
  }

  public async createPullRequest(
    originalRepoOwner: string,
    originalRepoName: string,
    yourGithubUsername: string,
    baseBranch: string,
    newBranchName: string,
    contentModifications: ContentModifications,
    pullRequestTitle: string,
    pullRequestBody: string,
  ): Promise<{ prNumber: number; commitSha: string }> {
    try {
      const getRefResponse = await this.octokit.rest.git.getRef({
        owner: originalRepoOwner,
        repo: originalRepoName,
        ref: `heads/${baseBranch}`,
      });
      const latestCommitSha = getRefResponse.data.object.sha;

      const getCommitResponse = await this.octokit.rest.git.getCommit({
        owner: originalRepoOwner,
        repo: originalRepoName,
        commit_sha: latestCommitSha,
      });
      const baseTreeSha = getCommitResponse.data.tree.sha;

      const treeItems: {
        path: string;
        mode: '100644' | '100755' | '040000' | '160000' | '120000';
        type: 'blob' | 'tree' | 'commit';
        sha?: string;
        content?: string;
      }[] = [];

      for (const filePath of Object.keys(contentModifications)) {
        const getContentResponse = await this.octokit.rest.repos.getContent({
          owner: originalRepoOwner,
          repo: originalRepoName,
          path: filePath,
          ref: baseBranch,
        });

        if (
          getContentResponse.data &&
          'content' in getContentResponse.data &&
          typeof getContentResponse.data.content === 'string'
        ) {
          let fileContent = Buffer.from(getContentResponse.data.content, 'base64').toString('utf-8');

          const modifications = contentModifications[filePath];
          for (const mod of modifications) {
            fileContent = fileContent.replace(mod.oldContent, mod.newContent);
          }

          const createBlobResponse = await this.octokit.rest.git.createBlob({
            owner: yourGithubUsername,
            repo: originalRepoName,
            content: fileContent,
            encoding: 'utf-8',
          });
          const newBlobSha = createBlobResponse.data.sha;

          treeItems.push({
            path: filePath,
            mode: '100644',
            type: 'blob',
            sha: newBlobSha,
          });
        } else {
          throw new GithubNotFoundError('file content', filePath);
        }
      }

      const createTreeResponse = await this.octokit.rest.git.createTree({
        owner: yourGithubUsername,
        repo: originalRepoName,
        base_tree: baseTreeSha,
        tree: treeItems,
      });
      const newTreeSha = createTreeResponse.data.sha;

      const createCommitResponse = await this.octokit.rest.git.createCommit({
        owner: yourGithubUsername,
        repo: originalRepoName,
        message: pullRequestTitle,
        tree: newTreeSha,
        parents: [latestCommitSha],
      });
      const newCommitSha = createCommitResponse.data.sha;

      try {
        await this.octokit.rest.git.createRef({
          owner: yourGithubUsername,
          repo: originalRepoName,
          ref: `refs/heads/${newBranchName}`,
          sha: newCommitSha,
        });
        this.logger.info('Successfully created branch: {} in your fork', newBranchName);
      } catch (error: any) {
        this.logger.warn('Branch {} might already exist in your fork: {}', newBranchName, error);
      }

      const createPullResponse = await this.octokit.rest.pulls.create({
        owner: originalRepoOwner,
        repo: originalRepoName,
        head: `${yourGithubUsername}:${newBranchName}`,
        base: baseBranch,
        title: pullRequestTitle,
        body: pullRequestBody,
      });

      this.logger.info('Successfully created pull request: {}', createPullResponse.data.html_url);
      return {
        prNumber: createPullResponse.data.number,
        commitSha: newCommitSha,
      };
    } catch (error: any) {
      this.logger.error('Error creating pull request and updating files: {}', error);
      throw new GithubApiError(`Failed to create pull request and update files`, error.status, error);
    }
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<{ sha: string; message: string }> {
    try {
      const response = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: 'merge',
      });

      return {
        sha: response.data.sha,
        message: response.data.message,
      };
    } catch (error: any) {
      this.logger.error('Failed to merge pull request #{}: {}', pullNumber, error);
      throw new GithubApiError(`Failed to merge pull request #${pullNumber}`, error.status, error);
    }
  }
}

import { Octokit } from '@octokit/rest';
import { Buffer } from 'buffer';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import { GithubApiError, GithubNotFoundError } from '../errors/github.errors';

export class GithubPullRequestService {
  constructor(private readonly octokit: Octokit) {}

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
      console.error(`Failed to list pull requests for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
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
        console.error(`Pull request #${pullNumber} not found in ${owner}/${repo}`);
        throw new GithubNotFoundError('pull request', `#${pullNumber} in ${owner}/${repo}`, error.status || 404);
      }
      console.error(`Failed to get pull request #${pullNumber} for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
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
        console.log(`Successfully created branch: ${newBranchName} in your fork.`);
      } catch (error: any) {
        console.warn(`Branch ${newBranchName} might already exist in your fork: ${error.message}`);
      }

      const createPullResponse = await this.octokit.rest.pulls.create({
        owner: originalRepoOwner,
        repo: originalRepoName,
        head: `${yourGithubUsername}:${newBranchName}`,
        base: baseBranch,
        title: pullRequestTitle,
        body: pullRequestBody,
      });

      console.log(`Successfully created pull request: ${createPullResponse.data.html_url}`);
      return {
        prNumber: createPullResponse.data.number,
        commitSha: newCommitSha,
      };
    } catch (error: any) {
      console.error(`Error creating pull request and updating files: ${error instanceof Error ? error.message : String(error)}`);
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
      console.error(`Failed to merge pull request #${pullNumber}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to merge pull request #${pullNumber}`, error.status, error);
    }
  }
}

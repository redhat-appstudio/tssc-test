import { Octokit } from '@octokit/rest';
import { Buffer } from 'buffer';
import { GithubApiError, GithubNotFoundError } from '../errors/github.errors';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

export class GithubRepositoryService {
  private readonly logger: Logger;

  constructor(private readonly octokit: Octokit) {
    this.logger = LoggerFactory.getLogger('github.repository');
  }

  public async getRepository(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo,
      });
      return data;
    } catch (error: any) {
      this.logger.error('Failed to get repository {}/{}: {}', owner, repo, error);
      throw new GithubApiError(`Failed to get repository ${owner}/${repo}`, error.status, error);
    }
  }

  public async getContent(owner: string, repo: string, path: string, ref?: string) {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });
      return data;
    } catch (error: any) {
      this.logger.error('Failed to get content for {}/{} at path {}: {}', owner, repo, path, error);
      throw new GithubApiError(`Failed to get content for ${owner}/${repo} at path ${path}`, error.status, error);
    }
  }

  public async commit(
    repoOwner: string,
    sourceRepoName: string,
    modifications: ContentModifications | ContentModifications[],
    message: string,
    branch: string = 'main',
  ): Promise<string> {
    this.logger.info('Committing changes to branch \'{}\' with message: {}', branch, message);
    try {
      const { data: refData } = await this.octokit.git.getRef({
        owner: repoOwner,
        repo: sourceRepoName,
        ref: `heads/${branch}`,
      });
      const latestCommitSha = refData.object.sha;

      const { data: commitData } = await this.octokit.git.getCommit({
        owner: repoOwner,
        repo: sourceRepoName,
        commit_sha: latestCommitSha,
      });
      const baseTreeSha = commitData.tree.sha;

      const modificationsArray = Array.isArray(modifications) ? modifications : [modifications];
      const fileModificationsMap = new Map<string, { oldContent: string; newContent: string }[]>();

      for (const modification of modificationsArray) {
        for (const [filePath, changes] of Object.entries(modification)) {
          if (!fileModificationsMap.has(filePath)) {
            fileModificationsMap.set(filePath, []);
          }
          const fileChanges = fileModificationsMap.get(filePath)!;
          for (const change of changes as Array<{ oldContent: string; newContent: string }>) {
            fileChanges.push({
              oldContent: change.oldContent,
              newContent: change.newContent,
            });
          }
        }
      }

      const treeItems: {
        path: string;
        mode: '100644' | '100755' | '040000' | '160000' | '120000';
        type: 'blob' | 'tree' | 'commit';
        sha?: string;
        content?: string;
      }[] = [];

      for (const [filePath, changes] of fileModificationsMap.entries()) {
        try {
          const fileContentResponse = await this.octokit.repos.getContent({
            owner: repoOwner,
            repo: sourceRepoName,
            path: filePath,
            ref: branch,
          });

          if (!fileContentResponse.data || !('content' in fileContentResponse.data)) {
            throw new GithubNotFoundError('file content', filePath);
          }

          let currentContent = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');

          for (const change of changes) {
            currentContent = currentContent.replace(change.oldContent, change.newContent);
          }

          const { data: blobData } = await this.octokit.git.createBlob({
            owner: repoOwner,
            repo: sourceRepoName,
            content: currentContent,
            encoding: 'utf-8',
          });

          treeItems.push({
            path: filePath,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha,
          });
        } catch (error: any) {
          this.logger.error('Error processing file {}: {}', filePath, error);
          throw new GithubApiError(`Failed to process file ${filePath}`, error.status, error);
        }
      }

      const { data: treeData } = await this.octokit.git.createTree({
        owner: repoOwner,
        repo: sourceRepoName,
        base_tree: baseTreeSha,
        tree: treeItems,
      });

      const { data: newCommitData } = await this.octokit.git.createCommit({
        owner: repoOwner,
        repo: sourceRepoName,
        message: message,
        tree: treeData.sha,
        parents: [latestCommitSha],
      });

      await this.octokit.git.updateRef({
        owner: repoOwner,
        repo: sourceRepoName,
        ref: `heads/${branch}`,
        sha: newCommitData.sha,
      });

      this.logger.info('Changes committed successfully to {}/{} branch \'{}\' with commit SHA: {}', repoOwner, sourceRepoName, branch, newCommitData.sha);
      return newCommitData.sha;
    } catch (error: any) {
      this.logger.error('Failed to commit changes to branch \'{}\': {}', branch, error);
      throw new GithubApiError(`Failed to commit changes to branch '${branch}'`, error.status, error);
    }
  }

  public async extractContentByRegex(
    repoOwner: string,
    repoName: string,
    filePath: string,
    searchPattern: RegExp,
    branch: string = 'main',
  ): Promise<string[]> {
    try {
      this.logger.info('Searching for pattern {} in file {} ({} branch)', searchPattern, filePath, branch);

      const fileContentResponse = await this.octokit.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      if (!fileContentResponse.data || !('content' in fileContentResponse.data)) {
        this.logger.info('Could not retrieve content for file: {}', filePath);
        return [];
      }

      const content = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');
      const matches = content.match(searchPattern);

      if (!matches) {
        this.logger.info('No matches found in file {}', filePath);
        return [];
      }

      this.logger.info('Found {} matches in {}', matches.length, filePath);
      return matches;
    } catch (error: any) {
      this.logger.error('Error extracting content with regex from {}: {}', filePath, error);
      throw new GithubApiError(`Failed to extract content by regex from ${filePath}`, error.status, error);
    }
  }

  public async getBranchCommitSha(
    repoOwner: string,
    repoName: string,
    branch: string = 'main',
  ): Promise<string> {
    try {
      this.logger.info('Getting latest commit SHA for {}/{} branch \'{}\'', repoOwner, repoName, branch);

      const response = await this.octokit.repos.getBranch({
        owner: repoOwner,
        repo: repoName,
        branch: branch,
      });

      const commitSha = response.data.commit.sha;
      this.logger.info('Latest commit SHA for branch \'{}\': {}', branch, commitSha);

      return commitSha;
    } catch (error: any) {
      this.logger.error('Failed to get commit SHA for branch \'{}\': {}', branch, error);
      throw new GithubApiError(`Failed to get commit SHA for branch '${branch}'`, error.status, error);
    }
  }
}

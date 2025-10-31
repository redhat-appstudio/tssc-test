import { Octokit } from '@octokit/rest';
import { Buffer } from 'buffer';
import retry from 'async-retry';
import { defaultLogger } from '../../../log/logger';
import { GithubApiError, GithubNotFoundError } from '../errors/github.errors';
import { ContentModifications } from '../../../rhtap/modification/contentModification';

export class GithubRepositoryService {
  // Retry configuration constants
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly BASE_DELAY_MS = 200;
  private static readonly MAX_DELAY_MS = 800;

  constructor(private readonly octokit: Octokit) {}

  public async getRepository(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.repos.get({
        owner,
        repo,
      });
      return data;
    } catch (error: any) {
      console.error(`Failed to get repository ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
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
      console.error(`Failed to get content for ${owner}/${repo} at path ${path}: ${error instanceof Error ? error.message : String(error)}`);
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
    console.log(`Committing changes to branch '${branch}' with message: ${message}`);
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
          console.error(`Error processing file ${filePath}:`, error);
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

      console.log(`Changes committed successfully to ${repoOwner}/${sourceRepoName} branch '${branch}' with commit SHA: ${newCommitData.sha}`);
      return newCommitData.sha;
    } catch (error: any) {
      console.error(`Failed to commit changes to branch '${branch}': ${error instanceof Error ? error.message : String(error)}`);
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
      console.log(`Searching for pattern ${searchPattern} in file ${filePath} (${branch} branch)`);

      const fileContentResponse = await this.octokit.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      if (!fileContentResponse.data || !('content' in fileContentResponse.data)) {
        console.log(`Could not retrieve content for file: ${filePath}`);
        return [];
      }

      const content = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');
      const matches = content.match(searchPattern);

      if (!matches) {
        console.log(`No matches found in file ${filePath}`);
        return [];
      }

      console.log(`Found ${matches.length} matches in ${filePath}`);
      return matches;
    } catch (error: any) {
      console.error(`Error extracting content with regex from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to extract content by regex from ${filePath}`, error.status, error);
    }
  }

  public async getBranchCommitSha(
    repoOwner: string,
    repoName: string,
    branch: string = 'main',
  ): Promise<string> {
    try {
      console.log(`Getting latest commit SHA for ${repoOwner}/${repoName} branch '${branch}'`);

      const response = await this.octokit.repos.getBranch({
        owner: repoOwner,
        repo: repoName,
        branch: branch,
      });

      const commitSha = response.data.commit.sha;
      console.log(`Latest commit SHA for branch '${branch}': ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      console.error(`Failed to get commit SHA for branch '${branch}': ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to get commit SHA for branch '${branch}'`, error.status, error);
    }
  }

  /**
   * Deletes a file from a repository
   * @param owner The repository owner
   * @param repo The repository name
   * @param path The path to the file to delete
   * @param message The commit message
   * @param sha The SHA of the file to delete
   * @param branch The branch to delete from (default: 'main')
   * @returns Promise<void>
   */
  public async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch: string = 'main'
  ): Promise<void> {
    // Input validation
    if (!owner || owner.trim() === '') {
      throw new Error('Owner is required and cannot be empty');
    }
    if (!repo || repo.trim() === '') {
      throw new Error('Repository name is required and cannot be empty');
    }
    if (!path || path.trim() === '') {
      throw new Error('File path is required and cannot be empty');
    }
    if (!message || message.trim() === '') {
      throw new Error('Commit message is required and cannot be empty');
    }
    if (!sha || sha.trim() === '') {
      throw new Error('File SHA is required and cannot be empty');
    }
    if (!branch || branch.trim() === '') {
      throw new Error('Branch is required and cannot be empty');
    }

    const trimmedOwner = owner.trim();
    const trimmedRepo = repo.trim();
    const trimmedPath = path.trim();
    const trimmedMessage = message.trim();
    const trimmedSha = sha.trim();
    const trimmedBranch = branch.trim();

    try {
      await retry(
        async () => {
          await this.octokit.repos.deleteFile({
            owner: trimmedOwner,
            repo: trimmedRepo,
            path: trimmedPath,
            message: trimmedMessage,
            sha: trimmedSha,
            branch: trimmedBranch,
          });
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onRetry: (error: any, attempt: number) => {
            const status = error.status || error.response?.status;
            const errorCode = error.code;
            
            // Check for retryable HTTP status codes
            const isHttpRetryable = status === 429 || (status >= 500 && status < 600);
            
            // Check for retryable transport error codes
            const retryableTransportCodes = [
              'ETIMEDOUT',
              'ECONNRESET', 
              'ENOTFOUND',
              'EAI_AGAIN',
              'ECONNREFUSED',
              'EHOSTUNREACH',
              'ENETUNREACH',
              'ETIMEOUT'
            ];
            const isTransportRetryable = errorCode && retryableTransportCodes.includes(errorCode);
            
            const isRetryable = isHttpRetryable || isTransportRetryable;
            
            if (isRetryable) {
              defaultLogger.warn({
                operation: 'deleteFile',
                owner: trimmedOwner,
                repo: trimmedRepo,
                path: trimmedPath,
                attempt,
                status,
                errorCode,
                error: error.message
              }, `Retrying file deletion (attempt ${attempt}/3) - Status: ${status}, Code: ${errorCode}`);
            } else {
              // Non-retryable error, throw immediately
              throw error;
            }
          }
        }
      );

      defaultLogger.info({
        operation: 'deleteFile',
        owner: trimmedOwner,
        repo: trimmedRepo,
        path: trimmedPath,
        branch: trimmedBranch
      }, `Successfully deleted file ${trimmedPath} from ${trimmedOwner}/${trimmedRepo}`);
    } catch (error: any) {
      const status = error.status || error.response?.status;
      
      defaultLogger.error({
        operation: 'deleteFile',
        owner: trimmedOwner,
        repo: trimmedRepo,
        path: trimmedPath,
        branch: trimmedBranch,
        error: error.message,
        status
      }, `Failed to delete file ${trimmedPath} from ${trimmedOwner}/${trimmedRepo} - Status: ${status}`);
      
      throw new GithubApiError(`Failed to delete file ${trimmedPath} from ${trimmedOwner}/${trimmedRepo}`, status, error);
    }
  }

  /**
   * Deletes a repository
   * @param owner The repository owner
   * @param repo The repository name
   * @returns Promise<void>
   */
  public async deleteRepository(owner: string, repo: string): Promise<void> {
    // Validate inputs before making API call
    const trimmedOwner = owner?.trim();
    const trimmedRepo = repo?.trim();
    
    if (!trimmedOwner || !trimmedRepo) {
      const missingFields = [];
      if (!trimmedOwner) missingFields.push('owner');
      if (!trimmedRepo) missingFields.push('repo');
      throw new GithubApiError(
        `Invalid repository parameters: missing or empty ${missingFields.join(' and ')}`,
        400,
        new Error(`Missing required fields: ${missingFields.join(', ')}`)
      );
    }

    try {
      await retry(
        async () => {
          await this.octokit.repos.delete({
            owner: trimmedOwner,
            repo: trimmedRepo,
          });
        },
        {
          retries: GithubRepositoryService.RETRY_ATTEMPTS,
          minTimeout: GithubRepositoryService.BASE_DELAY_MS,
          maxTimeout: GithubRepositoryService.MAX_DELAY_MS,
          factor: 2,
          onRetry: (error: any, attempt: number) => {
            const status = error.status || error.response?.status;
            const isRetryable = status === 429 || (status >= 500 && status < 600) || 
                               error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || 
                               error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED';
            
            if (isRetryable) {
              const delay = Math.min(
                GithubRepositoryService.BASE_DELAY_MS * Math.pow(2, attempt - 1),
                GithubRepositoryService.MAX_DELAY_MS
              );
              
              defaultLogger.warn({
                operation: 'deleteRepository',
                owner: trimmedOwner,
                repo: trimmedRepo,
                attempt,
                status,
                error: error.message,
                delay
              }, `Retrying repository deletion (attempt ${attempt}/${GithubRepositoryService.RETRY_ATTEMPTS}) - Status: ${status}, Delay: ${delay}ms`);
            } else {
              // Non-retryable error, throw immediately
              throw error;
            }
          }
        }
      );

      defaultLogger.info({
        operation: 'deleteRepository',
        owner: trimmedOwner,
        repo: trimmedRepo
      }, `Successfully deleted repository ${trimmedOwner}/${trimmedRepo}`);
    } catch (error: any) {
      const status = error.status || error.response?.status;
      
      defaultLogger.error({
        operation: 'deleteRepository',
        owner: trimmedOwner,
        repo: trimmedRepo,
        error: error.message,
        status
      }, `Failed to delete repository ${trimmedOwner}/${trimmedRepo} - Status: ${status}`);
      
      throw new GithubApiError(`Failed to delete repository ${trimmedOwner}/${trimmedRepo}`, status, error);
    }
  }
}

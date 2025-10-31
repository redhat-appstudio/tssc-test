import retry from 'async-retry';
import { defaultLogger } from '../../../log/logger';
import { BitbucketHttpClient } from '../http/bitbucket-http.client';
import { BitbucketRepository, BitbucketBranch, BitbucketCommit, BitbucketPaginatedResponse, BitbucketDirectoryEntry } from '../types/bitbucket.types';

export class BitbucketRepositoryService {
  constructor(private readonly httpClient: BitbucketHttpClient) {}

  public async getRepository(workspace: string, repoSlug: string): Promise<BitbucketRepository> {
    return this.httpClient.get<BitbucketRepository>(`/repositories/${workspace}/${repoSlug}`);
  }

  public async getBranches(workspace: string, repoSlug: string): Promise<BitbucketBranch[]> {
    const response = await this.httpClient.get<BitbucketPaginatedResponse<BitbucketBranch>>(
      `/repositories/${workspace}/${repoSlug}/refs/branches`
    );
    return response.values;
  }

  public async createBranch(workspace: string, repoSlug: string, name: string, targetHash: string): Promise<BitbucketBranch> {
    return this.httpClient.post(`/repositories/${workspace}/${repoSlug}/refs/branches`, {
      name,
      target: {
        hash: targetHash,
      },
    });
  }

  public async getCommits(workspace: string, repoSlug: string): Promise<BitbucketCommit[]> {
    const response = await this.httpClient.get<BitbucketPaginatedResponse<BitbucketCommit>>(
      `/repositories/${workspace}/${repoSlug}/commits`
    );
    
    return response.values;
  }

  public async createCommit(
    workspace: string, 
    repoSlug: string, 
    data: Record<string, any>
  ): Promise<BitbucketCommit> {
    return this.httpClient.post<BitbucketCommit>(`/repositories/${workspace}/${repoSlug}/src`, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  public async getFileContent(workspace: string, repoSlug: string, filePath: string, ref: string = 'main'): Promise<string> {
    return this.httpClient.get<string>(`/repositories/${workspace}/${repoSlug}/src/${ref}/${filePath}`);
  }

  public async getDirectoryContent(workspace: string, repoSlug: string, path: string, ref: string = 'main'): Promise<BitbucketDirectoryEntry[]> {
    // Input validation
    if (!workspace || workspace.trim() === '') {
      throw new Error('Workspace is required and cannot be empty');
    }
    if (!repoSlug || repoSlug.trim() === '') {
      throw new Error('Repository slug is required and cannot be empty');
    }
    if (!ref || ref.trim() === '') {
      throw new Error('Reference is required and cannot be empty');
    }

    const trimmedWorkspace = workspace.trim();
    const trimmedRepoSlug = repoSlug.trim();
    const trimmedPath = path.trim();
    const trimmedRef = ref.trim();

    try {
      const response = await retry(
        async () => {
          return await this.httpClient.get<BitbucketPaginatedResponse<BitbucketDirectoryEntry>>(
            `/repositories/${trimmedWorkspace}/${trimmedRepoSlug}/src/${trimmedRef}/${trimmedPath}`
          );
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          factor: 2,
          onRetry: (error: Error, attempt: number) => {
            defaultLogger.warn({
              operation: 'getDirectoryContent',
              workspace: trimmedWorkspace,
              repoSlug: trimmedRepoSlug,
              path: trimmedPath,
              ref: trimmedRef,
              attempt,
              error: error.message
            }, `Retrying directory content retrieval (attempt ${attempt}/3)`);
          }
        }
      );

      // Defensive validation of response
      if (!response || !Array.isArray(response.values)) {
        defaultLogger.warn({
          operation: 'getDirectoryContent',
          workspace: trimmedWorkspace,
          repoSlug: trimmedRepoSlug,
          path: trimmedPath,
          ref: trimmedRef,
          responseType: typeof response,
          hasValues: !!response?.values
        }, `Invalid response structure for directory content, returning empty array`);
        return [];
      }

      defaultLogger.info({
        operation: 'getDirectoryContent',
        workspace: trimmedWorkspace,
        repoSlug: trimmedRepoSlug,
        path: trimmedPath,
        ref: trimmedRef,
        itemCount: response.values.length
      }, `Successfully retrieved directory content for ${trimmedWorkspace}/${trimmedRepoSlug}/${trimmedPath}`);

      return response.values;
    } catch (error: any) {
      // Handle 404 errors gracefully for idempotent operations
      if (error.response?.status === 404 || error.status === 404 || error.message?.includes('404')) {
        defaultLogger.info({
          operation: 'getDirectoryContent',
          workspace: trimmedWorkspace,
          repoSlug: trimmedRepoSlug,
          path: trimmedPath,
          ref: trimmedRef,
          status: 'not_found'
        }, `Directory content not found for ${trimmedWorkspace}/${trimmedRepoSlug}/${trimmedPath} (404 Not Found)`);
        return [];
      }

      defaultLogger.error({
        operation: 'getDirectoryContent',
        workspace: trimmedWorkspace,
        repoSlug: trimmedRepoSlug,
        path: trimmedPath,
        ref: trimmedRef,
        error: error.message,
        status: error.response?.status || error.status
      }, `Failed to get directory content for ${trimmedWorkspace}/${trimmedRepoSlug}/${trimmedPath}`);
      throw error;
    }
  }

  public async deleteFile(workspace: string, repoSlug: string, filePath: string, branch: string = 'main', commitMessage: string = 'Delete file'): Promise<void> {
    try {
      // Bitbucket API requires a commit with file deletion
      const commitData = {
        message: commitMessage,
        branch: branch,
        files: {
          [filePath]: null // null value indicates file deletion
        }
      };
      
      await this.httpClient.post(`/repositories/${workspace}/${repoSlug}/src`, commitData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      
      console.log(`Successfully deleted file ${filePath} from ${workspace}/${repoSlug}`);
    } catch (error) {
      console.error(`Failed to delete file ${filePath} from ${workspace}/${repoSlug}:`, error);
      throw error;
    }
  }
}

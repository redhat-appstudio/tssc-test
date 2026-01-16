import { Gitlab } from '@gitbeaker/rest';
import { IGitLabRepositoryService } from '../interfaces/gitlab.interfaces';
import {
  GitLabBranch,
  GitLabCommit,
  GitLabCommitSearchParams,
  GitLabFile,
  GitLabFileOperationResult,
  FileAction,
  CommitResult,
  ProjectIdentifier,
  ContentExtractionResult,
} from '../types/gitlab.types';
import retry from 'async-retry';
import { createGitLabErrorFromResponse, isRetryableError } from '../errors/gitlab.errors';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

export class GitLabRepositoryService implements IGitLabRepositoryService {
  private readonly logger: Logger;

  constructor(private readonly gitlabClient: InstanceType<typeof Gitlab>) {
    this.logger = LoggerFactory.getLogger('gitlab.repository');
  }

  // Branch operations
  public async getBranches(projectId: ProjectIdentifier): Promise<GitLabBranch[]> {
    try {
      const branches = await this.gitlabClient.Branches.all(projectId);
      return branches as GitLabBranch[];
    } catch (error) {
      throw createGitLabErrorFromResponse('getBranches', error, 'project', projectId);
    }
  }

  public async getBranch(projectId: ProjectIdentifier, branch: string): Promise<GitLabBranch> {
    try {
      const branchData = await this.gitlabClient.Branches.show(projectId, branch);
      return branchData as GitLabBranch;
    } catch (error) {
      throw createGitLabErrorFromResponse('getBranch', error, 'branch', branch);
    }
  }

  public async createBranch(
    projectId: ProjectIdentifier,
    branchName: string,
    ref: string
  ): Promise<GitLabBranch> {
    try {
      const branch = await this.gitlabClient.Branches.create(projectId, branchName, ref);
      this.logger.info('Created new branch \'{}\' from \'{}\'', branchName, ref);
      return branch as GitLabBranch;
    } catch (error) {
      throw createGitLabErrorFromResponse('createBranch', error, 'branch', branchName);
    }
  }

  // Commit operations
  public async getCommits(
    projectId: ProjectIdentifier,
    params: GitLabCommitSearchParams = {}
  ): Promise<GitLabCommit[]> {
    try {
      const commits = await this.gitlabClient.Commits.all(projectId, params);
      return commits as GitLabCommit[];
    } catch (error) {
      throw createGitLabErrorFromResponse('getCommits', error, 'project', projectId);
    }
  }

  public async createCommit(
    projectId: ProjectIdentifier,
    branch: string,
    commitMessage: string,
    actions: FileAction[],
    startBranch?: string
  ): Promise<CommitResult> {
    try {
      this.logger.info(
        'Creating direct commit to branch {} with {} file actions{}',
        branch,
        actions.length,
        startBranch ? ` (branching from ${startBranch})` : ''
      );

      // Convert file_path to filePath as required by the GitLab API
      const formattedActions = actions.map(action => ({
        action: action.action,
        filePath: action.filePath,
        content: action.content,
      }));

      // If startBranch is provided, create branch + commit in one operation
      const commitOptions: any = startBranch ? { startBranch } : {};

      // Wrap commit creation with retry logic for transient errors
      const response = await retry(
        async (bail, attempt) => {
          try {
            return await this.gitlabClient.Commits.create(
              projectId,
              branch,
              commitMessage,
              formattedActions,
              commitOptions
            );
          } catch (error) {
            // Check if error is retryable
            if (isRetryableError(error)) {
              // Let retry mechanism handle it
              const errorMessage = error;
              this.logger.warn(
                'Retry attempt {}/{} for commit to {}: {}',
                attempt,
                3,
                branch,
                errorMessage
              );
              throw error;
            } else {
              // Non-retryable errors should fail immediately
              this.logger.error(
                'Non-retryable error on branch {}: {}',
                branch,
                error,

              );
              bail(error as Error);
              return null as any; // TypeScript requirement, never reached
            }
          }
        },
        {
          retries: 3,
          minTimeout: 2000,
          maxTimeout: 10000,
          onRetry: (error: Error, attempt: number) => {
            this.logger.warn(
              'Retry attempt {}/{} for commit to {}: {}',
              attempt,
              3,
              branch,
              error.message
            );
          },
        }
      );

      this.logger.info(
        'Successfully created commit: {}',
        JSON.stringify(
          {
            id: response.id,
            short_id: response.short_id,
            title: response.title,
          },
          null,
          2
        )
      );

      return { id: response.id };
    } catch (error) {
      this.logger.error('Failed to create commit on branch {}: {}', branch, error);
      throw createGitLabErrorFromResponse('createCommit', error, 'commit', branch);
    }
  }

  // File operations
  public async getFileContent(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string = 'main'
  ): Promise<GitLabFile> {
    try {
      const fileContent = await this.gitlabClient.RepositoryFiles.show(
        projectId,
        filePath,
        branch
      );

      if (!fileContent || !fileContent.content) {
        throw new Error(`Could not retrieve content for file: ${filePath}`);
      }

      return {
        content: fileContent.content,
        encoding: fileContent.encoding || 'base64',
      };
    } catch (error) {
      this.logger.error('Error getting file content from {}: {}', filePath, error);
      throw createGitLabErrorFromResponse('getFileContent', error, 'file', filePath);
    }
  }

  public async createFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<GitLabFileOperationResult> {
    try {
      const result = await this.gitlabClient.RepositoryFiles.create(
        projectId,
        filePath,
        branch,
        content,
        commitMessage
      );
      return result as GitLabFileOperationResult;
    } catch (error) {
      throw createGitLabErrorFromResponse('createFile', error, 'file', filePath);
    }
  }

  public async updateFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<GitLabFileOperationResult> {
    try {
      const result = await this.gitlabClient.RepositoryFiles.edit(
        projectId,
        filePath,
        branch,
        content,
        commitMessage
      );
      return result as GitLabFileOperationResult;
    } catch (error) {
      throw createGitLabErrorFromResponse('updateFile', error, 'file', filePath);
    }
  }

  public async extractContentByRegex(
    projectId: ProjectIdentifier,
    filePath: string,
    searchPattern: RegExp,
    branch: string = 'main'
  ): Promise<ContentExtractionResult> {
    try {
      this.logger.info(
        'Searching for pattern {} in file {} ({} branch)',
        searchPattern,
        filePath,
        branch
      );

      // Get the file content
      const fileContent = await this.gitlabClient.RepositoryFiles.show(
        projectId,
        filePath,
        branch
      );

      if (!fileContent || !fileContent.content) {
        this.logger.info('Could not retrieve content for file: {}', filePath);
        return [];
      }

      // Decode the content from base64
      const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');

      // Search for the pattern
      const matches = content.match(searchPattern);

      if (!matches) {
        this.logger.info('No matches found in file {}', filePath);
        return [];
      }

      this.logger.info('Found {} matches in {}', matches.length, filePath);
      return matches;
    } catch (error) {
      this.logger.error('Error extracting content with regex from {}: {}', filePath, error);
      return [];
    }
  }
} 
import { Gitlab } from '@gitbeaker/rest';
import { IGitLabRepositoryService } from '../interfaces/gitlab.interfaces';
import {
  GitLabBranch,
  GitLabCommit,
  GitLabCommitSearchParams,
  GitLabFile,
  FileAction,
  CommitResult,
  ProjectIdentifier,
  ContentExtractionResult,
} from '../types/gitlab.types';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';

export class GitLabRepositoryService implements IGitLabRepositoryService {
  constructor(private readonly gitlabClient: InstanceType<typeof Gitlab>) {}

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
      console.log(`Created new branch '${branchName}' from '${ref}'`);
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
    actions: FileAction[]
  ): Promise<CommitResult> {
    try {
      console.log(
        `Creating direct commit to branch ${branch} with ${actions.length} file actions`
      );

      // Convert file_path to filePath as required by the GitLab API
      const formattedActions = actions.map(action => ({
        action: action.action,
        filePath: action.filePath,
        content: action.content,
      }));

      const response = await this.gitlabClient.Commits.create(
        projectId,
        branch,
        commitMessage,
        formattedActions
      );

      console.log(
        `Successfully created commit: ${JSON.stringify(
          {
            id: response.id,
            short_id: response.short_id,
            title: response.title,
          },
          null,
          2
        )}`
      );

      return { id: response.id };
    } catch (error) {
      console.error(`Failed to create commit on branch ${branch}:`, error);
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
      console.error(`Error getting file content from ${filePath}:`, error);
      throw createGitLabErrorFromResponse('getFileContent', error, 'file', filePath);
    }
  }

  public async createFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<any> {
    try {
      const result = await this.gitlabClient.RepositoryFiles.create(
        projectId,
        filePath,
        branch,
        content,
        commitMessage
      );
      return result;
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
  ): Promise<any> {
    try {
      const result = await this.gitlabClient.RepositoryFiles.edit(
        projectId,
        filePath,
        branch,
        content,
        commitMessage
      );
      return result;
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
      console.log(
        `Searching for pattern ${searchPattern} in file ${filePath} (${branch} branch)`
      );

      // Get the file content
      const fileContent = await this.gitlabClient.RepositoryFiles.show(
        projectId,
        filePath,
        branch
      );

      if (!fileContent || !fileContent.content) {
        console.log(`Could not retrieve content for file: ${filePath}`);
        return [];
      }

      // Decode the content from base64
      const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');

      // Search for the pattern
      const matches = content.match(searchPattern);

      if (!matches) {
        console.log(`No matches found in file ${filePath}`);
        return [];
      }

      console.log(`Found ${matches.length} matches in ${filePath}`);
      return matches;
    } catch (error) {
      console.error(`Error extracting content with regex from ${filePath}:`, error);
      return [];
    }
  }
} 
import { Gitlab } from '@gitbeaker/rest';
import { IGitLabMergeRequestService, IGitLabRepositoryService, IGitLabProjectService } from '../interfaces/gitlab.interfaces';
import {
  GitLabMergeRequest,
  CreateMergeRequestOptions,
  MergeMergeRequestOptions,
  MergeRequestResult,
  MergeResult,
  ProjectIdentifier,
} from '../types/gitlab.types';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';

export class GitLabMergeRequestService implements IGitLabMergeRequestService {
  constructor(
    private readonly gitlabClient: InstanceType<typeof Gitlab>,
    private readonly repositoryService: IGitLabRepositoryService,
    private readonly projectService: IGitLabProjectService
  ) {}

  public async createMergeRequest(
    projectId: ProjectIdentifier,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    options: CreateMergeRequestOptions = {},
    contentModifications?: ContentModifications
  ): Promise<GitLabMergeRequest> {
    try {
      let sourceBranchExists = false;

      // Check if source branch already exists
      try {
        await this.repositoryService.getBranch(projectId, sourceBranch);
        sourceBranchExists = true;
        console.log(`Source branch '${sourceBranch}' already exists`);
      } catch (error: any) {
        if (error.message && error.message.includes('not found')) {
          // Branch doesn't exist, need to create it
          console.log(`Source branch '${sourceBranch}' doesn't exist, will create it`);
          sourceBranchExists = false;

          // Create the branch from target branch
          await this.repositoryService.createBranch(projectId, sourceBranch, targetBranch);
          console.log(`Created new branch '${sourceBranch}' from '${targetBranch}'`);
        } else {
          throw error;
        }
      }

      // Handle content modifications if provided
      if (contentModifications) {
        console.log(`Processing file modifications for merge request in project ${projectId}`);
        await this.processContentModifications(
          projectId,
          sourceBranch,
          targetBranch,
          sourceBranchExists,
          contentModifications,
          title
        );
      }

      // Create merge request
      const mergeRequestOptions = {
        description: options.description,
        removeSourceBranch: options.removeSourceBranch,
        squash: options.squash,
      };

      const mergeRequest = await this.gitlabClient.MergeRequests.create(
        projectId,
        sourceBranch,
        targetBranch,
        title,
        mergeRequestOptions
      );

      return mergeRequest as GitLabMergeRequest;
    } catch (error) {
      console.error(`Error creating merge request:`, error);
      throw createGitLabErrorFromResponse('createMergeRequest', error);
    }
  }

  public async createMergeRequestWithNewBranch(
    owner: string,
    repo: string,
    targetOwner: string,
    baseBranch: string,
    newBranchName: string,
    contentModifications: ContentModifications,
    title: string,
    description: string
  ): Promise<MergeRequestResult> {
    try {
      // Find the project ID for the repository
      let projectId: number;
      try {
        const project = await this.projectService.getProject(`${owner}/${repo}`);
        projectId = project.id;
      } catch (error) {
        throw new Error(`Project ${owner}/${repo} not found`);
      }

      // Create a new branch from the base branch
      await this.repositoryService.createBranch(projectId, newBranchName, baseBranch);
      console.log(`Created new branch '${newBranchName}' from '${baseBranch}'`);

      // Process all file modifications
      await this.processContentModifications(
        projectId,
        newBranchName,
        baseBranch,
        false,
        contentModifications,
        title
      );

      // Create merge request from new branch to base branch
      const mergeRequest = await this.gitlabClient.MergeRequests.create(
        projectId,
        newBranchName,
        baseBranch,
        title,
        {
          description: description,
          removeSourceBranch: true,
        }
      );

      // Get the commit SHA from the branch
      const commits = await this.repositoryService.getCommits(projectId, {
        ref_name: newBranchName,
      });
      const commitSha = commits.length > 0 ? commits[0].id : 'unknown';

      console.log(`Created merge request #${mergeRequest.iid} with commit SHA: ${commitSha}`);
      return { prNumber: mergeRequest.iid, commitSha };
    } catch (error: any) {
      console.error(`Error creating merge request:`, error);
      throw createGitLabErrorFromResponse('createMergeRequestWithNewBranch', error);
    }
  }

  public async mergeMergeRequest(
    projectId: ProjectIdentifier,
    mergeRequestId: number,
    options: MergeMergeRequestOptions = {}
  ): Promise<MergeResult> {
    try {
      console.log(`Merging merge request #${mergeRequestId} in project ${projectId}`);

      // Convert options if provided
      let mergeOptions: any = {};
      if (options.shouldRemoveSourceBranch) {
        mergeOptions.should_remove_source_branch = options.shouldRemoveSourceBranch;
      }
      if (options.mergeCommitMessage) {
        mergeOptions.merge_commit_message = options.mergeCommitMessage;
      }

      // Use GitLab API to accept the merge request
      const response = await this.gitlabClient.MergeRequests.accept(
        projectId,
        mergeRequestId,
        mergeOptions
      );

      console.log(`Successfully merged merge request #${mergeRequestId}`);

      // If merge_commit_sha is not available, fetch it separately
      let mergeCommitSha = response.merge_commit_sha;

      if (!mergeCommitSha) {
        console.log(
          `merge_commit_sha not found in merge response, fetching merge request details`
        );
        try {
          const mergeRequestDetails = await this.gitlabClient.MergeRequests.show(
            projectId,
            mergeRequestId
          );
          mergeCommitSha = mergeRequestDetails.merge_commit_sha;
          console.log(`Fetched merge commit SHA: ${mergeCommitSha}`);
        } catch (detailsError) {
          console.error(`Failed to fetch merge request details:`, detailsError);
        }
      }

      // If we still don't have a merge commit SHA, fall back to the regular SHA
      if (!mergeCommitSha) {
        console.warn(`Could not obtain merge_commit_sha, falling back to commit SHA`);
        mergeCommitSha = response.sha;
      }

      return {
        id: String(response.id || mergeRequestId),
        sha: String(response.sha || ''),
        mergeCommitSha: String(mergeCommitSha || ''),
      };
    } catch (error: any) {
      console.error(`Failed to merge merge request #${mergeRequestId}:`, error);
      throw createGitLabErrorFromResponse('mergeMergeRequest', error);
    }
  }

  private async processContentModifications(
    projectId: ProjectIdentifier,
    sourceBranch: string,
    targetBranch: string,
    sourceBranchExists: boolean,
    contentModifications: ContentModifications,
    commitMessage: string
  ): Promise<void> {
    const fileModifications: {
      action: 'create' | 'update';
      filePath: string;
      content: string;
    }[] = [];

    // Collect all file modifications
    for (const [filePath, modifications] of Object.entries(contentModifications)) {
      try {
        let fileContent: string;
        let fileAction: 'create' | 'update' = 'update';

        // Use target branch as reference for new branches or source branch for existing branches
        const refBranch = sourceBranchExists ? sourceBranch : targetBranch;

        try {
          const fileData = await this.repositoryService.getFileContent(
            projectId,
            filePath,
            refBranch
          );
          fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        } catch (error: any) {
          if (error.message && error.message.includes('not found')) {
            // File doesn't exist yet, start with empty content
            fileContent = '';
            fileAction = 'create';
          } else {
            throw error;
          }
        }

        // Apply each modification in sequence
        for (const { oldContent, newContent } of modifications) {
          fileContent = fileContent.replace(oldContent, newContent);
        }

        fileModifications.push({
          action: fileAction,
          filePath: filePath,
          content: fileContent,
        });
      } catch (error: any) {
        console.error(`Error preparing file modification for ${filePath}:`, error);
        throw error;
      }
    }

    // Create a commit with all file modifications in a single batch
    if (fileModifications.length > 0) {
      console.log(
        `Committing ${fileModifications.length} file changes to branch ${sourceBranch}`
      );

      await this.repositoryService.createCommit(
        projectId,
        sourceBranch,
        commitMessage,
        fileModifications
      );
    } else {
      console.log('No file changes to commit');
    }
  }
} 
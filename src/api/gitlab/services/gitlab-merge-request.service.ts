import { Gitlab } from '@gitbeaker/rest';
import { IGitLabMergeRequestService, IGitLabRepositoryService } from '../interfaces/gitlab.interfaces';
import {
  GitLabMergeRequest,
  CreateMergeRequestOptions,
  MergeMergeRequestOptions,
  MergeResult,
  ProjectIdentifier,
} from '../types/gitlab.types';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

export class GitLabMergeRequestService implements IGitLabMergeRequestService {
  private readonly logger: Logger;

  constructor(
    private readonly gitlabClient: InstanceType<typeof Gitlab>,
    private readonly repositoryService: IGitLabRepositoryService
  ) {
    this.logger = LoggerFactory.getLogger('gitlab.merge-request');
  }

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
        this.logger.info('Source branch \'{}\' already exists', sourceBranch);
      } catch (error: any) {
        if (error.message && error.message.toLowerCase().includes('not found')) {
          // Branch doesn't exist
          this.logger.info('Source branch \'{}\' doesn\'t exist', sourceBranch);
          sourceBranchExists = false;

          // Only create empty branch if we DON'T have content modifications
          // If we have content modifications, processContentModifications will create it atomically
          if (!contentModifications) {
            await this.repositoryService.createBranch(projectId, sourceBranch, targetBranch);
            this.logger.info('Created new branch \'{}\' from \'{}\'', sourceBranch, targetBranch);
          }
        } else {
          throw error;
        }
      }

      // Handle content modifications if provided
      if (contentModifications) {
        this.logger.info('Processing file modifications for merge request in project {}', projectId);
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

      this.logger.info('Successfully created merge request "{}" in project {} (#{} {} -> {})', title, projectId, mergeRequest.iid, sourceBranch, targetBranch);
      return mergeRequest as GitLabMergeRequest;
    } catch (error) {
      this.logger.error('Error creating merge request: {}', error);
      throw createGitLabErrorFromResponse('createMergeRequest', error);
    }
  }


  public async mergeMergeRequest(
    projectId: ProjectIdentifier,
    mergeRequestId: number,
    options: MergeMergeRequestOptions = {}
  ): Promise<MergeResult> {
    try {
      this.logger.info('Merging merge request #{} in project {}', mergeRequestId, projectId);

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

      this.logger.info('Successfully merged merge request #{}', mergeRequestId);

      // If merge_commit_sha is not available, fetch it separately
      let mergeCommitSha = response.merge_commit_sha;

      if (!mergeCommitSha) {
        this.logger.info(
          'merge_commit_sha not found in merge response, fetching merge request details'
        );
        try {
          const mergeRequestDetails = await this.gitlabClient.MergeRequests.show(
            projectId,
            mergeRequestId
          );
          mergeCommitSha = mergeRequestDetails.merge_commit_sha;
          this.logger.info('Fetched merge commit SHA: {}', mergeCommitSha);
        } catch (detailsError) {
          this.logger.error('Failed to fetch merge request details: {}', detailsError instanceof Error ? detailsError.message : String(detailsError));
        }
      }

      // If we still don't have a merge commit SHA, fall back to the regular SHA
      if (!mergeCommitSha) {
        this.logger.warn('Could not obtain merge_commit_sha, falling back to commit SHA');
        mergeCommitSha = response.sha;
      }

      return {
        id: String(response.id || mergeRequestId),
        sha: String(response.sha || ''),
        mergeCommitSha: String(mergeCommitSha || ''),
      };
    } catch (error: any) {
      // Handle GitLab API inconsistency: merge succeeds but returns 405
      if (error.cause?.response?.status === 405) {
        this.logger.warn('GitLab returned 405, verifying actual MR state...');

        try {
          const mrDetails = await this.gitlabClient.MergeRequests.show(
            projectId,
            mergeRequestId
          );

          // If MR is actually merged, treat as success
          if (mrDetails.state === 'merged' && mrDetails.merge_commit_sha) {
            this.logger.info('MR #{} successfully merged (despite 405)', mergeRequestId);
            return {
              id: String(mrDetails.id || mergeRequestId),
              sha: String(mrDetails.sha || ''),
              mergeCommitSha: String(mrDetails.merge_commit_sha),
            };
          }
        } catch (verifyError) {
          this.logger.error('Failed to verify MR state: {}', verifyError instanceof Error ? verifyError.message : String(verifyError));
        }
      }

      // Re-throw for genuine failures
      this.logger.error('Failed to merge merge request #{}: {}', mergeRequestId, error);
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
          if (error.message && error.message.toLowerCase().includes('not found')) {
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
        this.logger.error('Error preparing file modification for {}: {}', filePath, error);
        throw error;
      }
    }

    // Create a commit with all file modifications in a single batch
    if (fileModifications.length > 0) {
      this.logger.info(
        'Committing {} file changes to branch {}',
        fileModifications.length,
        sourceBranch
      );

      // If source branch doesn't exist, use startBranch to create branch + commit atomically
      await this.repositoryService.createCommit(
        projectId,
        sourceBranch,
        commitMessage,
        fileModifications,
        sourceBranchExists ? undefined : targetBranch
      );
    } else {
      this.logger.info('No file changes to commit');
    }
  }
} 
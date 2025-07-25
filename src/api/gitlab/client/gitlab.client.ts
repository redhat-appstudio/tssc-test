import { Gitlab } from '@gitbeaker/rest';
import { GitLabConfig } from '../config/gitlab.config';
import {
  IGitLabCoreClient,
  IGitLabProjectService,
  IGitLabRepositoryService,
  IGitLabMergeRequestService,
  IGitLabWebhookService,
  IGitLabPipelineService,
} from '../interfaces/gitlab.interfaces';
import { GitLabProjectService } from '../services/gitlab-project.service';
import { GitLabRepositoryService } from '../services/gitlab-repository.service';
import { GitLabMergeRequestService } from '../services/gitlab-merge-request.service';
import { GitLabWebhookService } from '../services/gitlab-webhook.service';
import { GitLabPipelineService } from '../services/gitlab-pipeline.service';
import {
  GitLabProject,
  GitLabProjectSearchParams,
  GitLabBranch,
  GitLabCommit,
  GitLabCommitSearchParams,
  GitLabMergeRequest,
  CreateMergeRequestOptions,
  MergeMergeRequestOptions,
  MergeRequestResult,
  MergeResult,
  GitLabFile,
  GitLabFileOperationResult,
  FileAction,
  CommitResult,
  GitLabVariable,
  CreateVariableOptions,
  ProjectIdentifier,
  ContentExtractionResult,
  GitLabWebhook,
  CreateWebhookOptions,
  GitLabPipeline,
  GitLabPipelineSearchParams,
} from '../types/gitlab.types';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import { PipelineStatus } from '../../../rhtap/core/integration/ci/pipeline';

/**
 * Main GitLab client that provides a comprehensive interface to GitLab operations
 * Uses composition pattern with service-oriented architecture
 */
export class GitLabClient implements IGitLabCoreClient {
  private readonly client: InstanceType<typeof Gitlab>;
  private readonly projectService: IGitLabProjectService;
  private readonly repositoryService: IGitLabRepositoryService;
  private readonly mergeRequestService: IGitLabMergeRequestService;
  private readonly webhookService: IGitLabWebhookService;
  private readonly pipelineService: IGitLabPipelineService;

  constructor(private readonly config: GitLabConfig) {
    // Initialize the GitLab client
    this.client = new Gitlab({
      host: config.baseUrl,
      token: config.token,
    });

    // Initialize services with dependency injection
    this.projectService = new GitLabProjectService(this.client);
    this.repositoryService = new GitLabRepositoryService(this.client);
    this.mergeRequestService = new GitLabMergeRequestService(
      this.client,
      this.repositoryService,
      this.projectService
    );
    this.webhookService = new GitLabWebhookService(this.client, this.projectService);
    this.pipelineService = new GitLabPipelineService(this.client);
  }

  // Core client access
  public getClient(): InstanceType<typeof Gitlab> {
    return this.client;
  }

  // Project operations
  public async getProjects(params?: GitLabProjectSearchParams): Promise<GitLabProject[]> {
    return this.projectService.getProjects(params);
  }

  public async getProject(projectIdOrPath: ProjectIdentifier): Promise<GitLabProject> {
    return this.projectService.getProject(projectIdOrPath);
  }

  public async setEnvironmentVariable(
    projectId: number,
    key: string,
    value: string,
    options?: CreateVariableOptions
  ): Promise<GitLabVariable> {
    return this.projectService.setEnvironmentVariable(projectId, key, value, options);
  }

  // Repository operations
  public async getBranches(projectId: ProjectIdentifier): Promise<GitLabBranch[]> {
    return this.repositoryService.getBranches(projectId);
  }

  public async getBranch(projectId: ProjectIdentifier, branch: string): Promise<GitLabBranch> {
    return this.repositoryService.getBranch(projectId, branch);
  }

  public async getCommits(
    projectId: ProjectIdentifier,
    params?: GitLabCommitSearchParams
  ): Promise<GitLabCommit[]> {
    return this.repositoryService.getCommits(projectId, params);
  }

  public async createFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<GitLabFileOperationResult> {
    return this.repositoryService.createFile(projectId, filePath, branch, content, commitMessage);
  }

  public async updateFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<GitLabFileOperationResult> {
    return this.repositoryService.updateFile(projectId, filePath, branch, content, commitMessage);
  }

  public async getFileContent(
    projectId: ProjectIdentifier,
    filePath: string,
    branch?: string
  ): Promise<GitLabFile> {
    return this.repositoryService.getFileContent(projectId, filePath, branch);
  }

  public async extractContentByRegex(
    projectId: ProjectIdentifier,
    filePath: string,
    searchPattern: RegExp,
    branch?: string
  ): Promise<ContentExtractionResult> {
    return this.repositoryService.extractContentByRegex(projectId, filePath, searchPattern, branch);
  }

  public async createCommit(
    projectId: ProjectIdentifier,
    branch: string,
    commitMessage: string,
    actions: FileAction[]
  ): Promise<CommitResult> {
    return this.repositoryService.createCommit(projectId, branch, commitMessage, actions);
  }

  // Merge request operations - overloaded methods for backward compatibility
  public async createMergeRequest(
    projectId: ProjectIdentifier,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    options?: CreateMergeRequestOptions,
    contentModifications?: ContentModifications
  ): Promise<GitLabMergeRequest>;

  public async createMergeRequest(
    owner: string,
    repo: string,
    targetOwner: string,
    baseBranch: string,
    newBranchName: string,
    contentModifications: ContentModifications,
    title: string,
    description: string
  ): Promise<MergeRequestResult>;

  public async createMergeRequest(
    ownerOrProjectId: string | ProjectIdentifier,
    repoOrSourceBranch: string,
    targetOwnerOrTargetBranch: string,
    baseBranchOrTitle: string,
    newBranchNameOrOptions?: string | CreateMergeRequestOptions,
    contentModifications?: ContentModifications,
    title?: string,
    description?: string
  ): Promise<GitLabMergeRequest | MergeRequestResult> {
    // Check if called with the repository format (first signature)
    if (
      typeof ownerOrProjectId === 'string' &&
      typeof repoOrSourceBranch === 'string' &&
      typeof targetOwnerOrTargetBranch === 'string' &&
      typeof baseBranchOrTitle === 'string' &&
      typeof newBranchNameOrOptions === 'string' &&
      contentModifications &&
      title &&
      description
    ) {
      return this.mergeRequestService.createMergeRequestWithNewBranch(
        ownerOrProjectId,
        repoOrSourceBranch,
        targetOwnerOrTargetBranch,
        baseBranchOrTitle,
        newBranchNameOrOptions,
        contentModifications,
        title,
        description
      );
    }
    // Called with the project ID format (second signature)
    else {
      const projectId = ownerOrProjectId;
      const sourceBranch = repoOrSourceBranch;
      const targetBranch = targetOwnerOrTargetBranch;
      const title = baseBranchOrTitle;
      const options = (newBranchNameOrOptions as CreateMergeRequestOptions) || {};

      return this.mergeRequestService.createMergeRequest(
        projectId,
        sourceBranch,
        targetBranch,
        title,
        options,
        contentModifications
      );
    }
  }

  public async mergeMergeRequest(
    projectId: ProjectIdentifier,
    mergeRequestId: number,
    options?: MergeMergeRequestOptions
  ): Promise<MergeResult> {
    return this.mergeRequestService.mergeMergeRequest(projectId, mergeRequestId, options);
  }

  // Webhook operations
  public async configWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    options?: CreateWebhookOptions
  ): Promise<GitLabWebhook> {
    return this.webhookService.configWebhook(owner, repo, webhookUrl, options);
  }

  // Pipeline operations
  /**
   * Gets pipelines for a specific repository and commit SHA with retry functionality
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @param sha Optional commit SHA for which to get pipelines
   * @param status Optional status filter for pipelines
   * @returns A promise that resolves to an array of GitLab pipelines
   */
  public async getPipelines(
    projectPath: string,
    sha?: string,
    status?: string
  ): Promise<GitLabPipeline[]> {
    const params: GitLabPipelineSearchParams = {
      ...(sha && { sha }),
      ...(status && { status }),
    };

    return this.pipelineService.getPipelines(projectPath, params);
  }

  /**
   * Gets all pipelines for a project
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @returns A promise that resolves to an array of GitLab pipelines
   */
  public async getAllPipelines(projectPath: string): Promise<GitLabPipeline[]> {
    return this.pipelineService.getAllPipelines(projectPath);
  }

  /**
   * Gets a specific pipeline by ID
   * @param projectPath The project path in GitLab (e.g., 'group/project')
   * @param pipelineId The ID of the pipeline to retrieve
   * @returns A promise that resolves to a GitLab pipeline
   */
  public async getPipelineById(projectPath: string, pipelineId: number): Promise<GitLabPipeline> {
    return this.pipelineService.getPipelineById(projectPath, pipelineId);
  }

  /**
   * Gets the logs for a specific pipeline job
   * @param projectPath The project path in GitLab
   * @param jobId The job ID for which to retrieve logs
   * @returns A promise that resolves to the job logs as a string
   */
  public async getPipelineLogs(projectPath: string, jobId: number): Promise<string> {
    return this.pipelineService.getPipelineLogs(projectPath, jobId);
  }

  /**
   * Maps GitLab pipeline status to our standardized PipelineStatus enum
   * @param gitlabStatus The status string from GitLab API
   * @returns The standardized PipelineStatus value
   */
  public mapPipelineStatus(gitlabStatus: string): PipelineStatus {
    return this.pipelineService.mapPipelineStatus(gitlabStatus);
  }
} 
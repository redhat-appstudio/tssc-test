import { Gitlab } from '@gitbeaker/rest';
import { ContentModifications } from '../../../rhtap/modification/contentModification';
import {
  GitLabProject,
  GitLabProjectSearchParams,
  GitLabBranch,
  GitLabCommit,
  GitLabCommitSearchParams,
  GitLabMergeRequest,
  CreateMergeRequestOptions,
  MergeMergeRequestOptions,
  MergeResult,
  GitLabPipeline,
  GitLabPipelineSearchParams,
  GitLabWebhook,
  CreateWebhookOptions,
  GitLabFile,
  GitLabFileOperationResult,
  FileAction,
  CommitResult,
  GitLabVariable,
  CreateVariableOptions,
  ProjectIdentifier,
  ContentExtractionResult,
} from '../types/gitlab.types';

/**
 * Interface for GitLab project operations
 */
export interface IGitLabProjectService {
  getProjects(params?: GitLabProjectSearchParams): Promise<GitLabProject[]>;
  getProject(projectId: ProjectIdentifier): Promise<GitLabProject>;
  setEnvironmentVariable(
    projectId: number,
    key: string,
    value: string,
    options?: CreateVariableOptions
  ): Promise<GitLabVariable>;
}

/**
 * Interface for GitLab repository operations (branches, commits, files)
 */
export interface IGitLabRepositoryService {
  // Branch operations
  getBranches(projectId: ProjectIdentifier): Promise<GitLabBranch[]>;
  getBranch(projectId: ProjectIdentifier, branch: string): Promise<GitLabBranch>;
  createBranch(projectId: ProjectIdentifier, branchName: string, ref: string): Promise<GitLabBranch>;

  // Commit operations
  getCommits(projectId: ProjectIdentifier, params?: GitLabCommitSearchParams): Promise<GitLabCommit[]>;
  createCommit(
    projectId: ProjectIdentifier,
    branch: string,
    commitMessage: string,
    actions: FileAction[]
  ): Promise<CommitResult>;

  // File operations
  getFileContent(
    projectId: ProjectIdentifier,
    filePath: string,
    branch?: string
  ): Promise<GitLabFile>;
  createFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<GitLabFileOperationResult>;
  updateFile(
    projectId: ProjectIdentifier,
    filePath: string,
    branch: string,
    content: string,
    commitMessage: string
  ): Promise<GitLabFileOperationResult>;
  extractContentByRegex(
    projectId: ProjectIdentifier,
    filePath: string,
    searchPattern: RegExp,
    branch?: string
  ): Promise<ContentExtractionResult>;
}

/**
 * Interface for GitLab merge request operations
 */
export interface IGitLabMergeRequestService {
  createMergeRequest(
    projectId: ProjectIdentifier,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    options?: CreateMergeRequestOptions,
    contentModifications?: ContentModifications
  ): Promise<GitLabMergeRequest>;

  mergeMergeRequest(
    projectId: ProjectIdentifier,
    mergeRequestId: number,
    options?: MergeMergeRequestOptions
  ): Promise<MergeResult>;
}

/**
 * Interface for GitLab pipeline operations
 */
export interface IGitLabPipelineService {
  getPipelines(
    projectPath: string,
    params?: GitLabPipelineSearchParams
  ): Promise<GitLabPipeline[]>;
  getAllPipelines(projectPath: string): Promise<GitLabPipeline[]>;
  getPipelineById(projectPath: string, pipelineId: number): Promise<GitLabPipeline>;
  getPipelineLogs(projectPath: string, jobId: number): Promise<string>;
  cancelPipeline(projectPath: string, pipelineId: number): Promise<GitLabPipeline>;
}

/**
 * Interface for GitLab webhook operations
 */
export interface IGitLabWebhookService {
  configWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    options?: CreateWebhookOptions
  ): Promise<GitLabWebhook>;
}

/**
 * Interface for the core GitLab client
 */
export interface IGitLabCoreClient {
  getClient(): InstanceType<typeof Gitlab>;
} 
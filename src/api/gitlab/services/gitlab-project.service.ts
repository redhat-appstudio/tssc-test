import { Gitlab } from '@gitbeaker/rest';
import { IGitLabProjectService } from '../interfaces/gitlab.interfaces';
import {
  GitLabProject,
  GitLabProjectSearchParams,
  GitLabVariable,
  CreateVariableOptions,
} from '../types/gitlab.types';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';

export class GitLabProjectService implements IGitLabProjectService {
  constructor(private readonly gitlabClient: InstanceType<typeof Gitlab>) {}

  public async getProjects(params: GitLabProjectSearchParams = {}): Promise<GitLabProject[]> {
    try {
      const projects = await this.gitlabClient.Projects.all(params);
      return projects as GitLabProject[];
    } catch (error) {
      throw createGitLabErrorFromResponse('getProjects', error);
    }
  }

  public async getProject(projectIdOrPath: number | string): Promise<GitLabProject> {
    try {
      const project = await this.gitlabClient.Projects.show(projectIdOrPath);
      return project as GitLabProject;
    } catch (error) {
      throw createGitLabErrorFromResponse(
        'getProject',
        error,
        'project',
        projectIdOrPath
      );
    }
  }

  public async setEnvironmentVariable(
    projectId: number,
    key: string,
    value: string,
    options: CreateVariableOptions = {}
  ): Promise<GitLabVariable> {
    try {
      const variableOptions = {
        protected: options.protected ?? false,
        masked: options.masked ?? false,
      };

      const response = await this.gitlabClient.ProjectVariables.create(
        projectId,
        key,
        value,
        variableOptions
      );

      console.log(`Environment variable '${key}' set successfully in project ${projectId}`);
      return response as GitLabVariable;
    } catch (error) {
      console.error(
        `Error setting environment variable '${key}' in project ${projectId}:`,
        error
      );
      throw createGitLabErrorFromResponse(
        'setEnvironmentVariable',
        error,
        'variable',
        key
      );
    }
  }
} 
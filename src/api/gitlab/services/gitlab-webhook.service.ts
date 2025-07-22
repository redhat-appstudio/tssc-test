import { Gitlab } from '@gitbeaker/rest';
import { IGitLabWebhookService, IGitLabProjectService } from '../interfaces/gitlab.interfaces';
import { GitLabWebhook, CreateWebhookOptions } from '../types/gitlab.types';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';

export class GitLabWebhookService implements IGitLabWebhookService {
  constructor(
    private readonly gitlabClient: InstanceType<typeof Gitlab>,
    private readonly projectService: IGitLabProjectService
  ) {}

  public async configWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    options: CreateWebhookOptions = {}
  ): Promise<GitLabWebhook> {
    try {
      const project = await this.projectService.getProject(`${owner}/${repo}`);

      if (!project) {
        throw new Error(`Project ${owner}/${repo} not found`);
      }

      const projectId = project.id;

      // Map options to GitLab API
      const hookOptions: any = {
        token: options.token || '',
        push_events: options.pushEvents ?? true,
        mergeRequestsEvents: options.mergeRequestsEvents ?? true,
        tagPushEvents: options.tagPushEvents ?? true,
        enableSslVerification: options.enableSslVerification ?? false,
      };

      const webhook = await this.gitlabClient.ProjectHooks.add(
        projectId,
        webhookUrl,
        hookOptions
      );

      return webhook as GitLabWebhook;
    } catch (error) {
      throw createGitLabErrorFromResponse('configWebhook', error, 'webhook', webhookUrl);
    }
  }
} 
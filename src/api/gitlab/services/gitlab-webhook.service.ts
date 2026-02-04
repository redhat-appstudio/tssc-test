import { Gitlab } from '@gitbeaker/rest';
import { IGitLabWebhookService, IGitLabProjectService } from '../interfaces/gitlab.interfaces';
import { GitLabWebhook, CreateWebhookOptions } from '../types/gitlab.types';
import { createGitLabErrorFromResponse } from '../errors/gitlab.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class GitLabWebhookService implements IGitLabWebhookService {
  private readonly logger: Logger;

  constructor(
    private readonly gitlabClient: InstanceType<typeof Gitlab>,
    private readonly projectService: IGitLabProjectService
  ) {
    this.logger = LoggerFactory.getLogger('gitlab.webhook');
  }

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
      // Default configuration avoids duplicate pipeline triggers:
      // - pushEvents: false (prevents duplicate when commits are pushed to MR branches)
      // - mergeRequestsEvents: true (covers MR open, update, and merge events)
      const hookOptions: any = {
        token: options.token || '',
        push_events: options.pushEvents ?? false,
        mergeRequestsEvents: options.mergeRequestsEvents ?? true,
        tagPushEvents: options.tagPushEvents ?? false,
        enableSslVerification: options.enableSslVerification ?? false,
      };

      // Check if webhook already exists (idempotent operation)
      const existingHooks = await this.gitlabClient.ProjectHooks.all(projectId);
      const existingHook = existingHooks.find((hook: any) => hook.url === webhookUrl);

      if (existingHook) {
        this.logger.info(`Webhook already exists for ${webhookUrl}, updating configuration`);
        // Update existing webhook to ensure configuration matches
        const updatedWebhook = await this.gitlabClient.ProjectHooks.edit(
          projectId,
          existingHook.id,
          webhookUrl,
          hookOptions
        );
        return updatedWebhook as GitLabWebhook;
      }

      // Create new webhook if it doesn't exist
      this.logger.info(`Creating new webhook for ${webhookUrl}`);
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
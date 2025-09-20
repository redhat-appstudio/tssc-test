// Main exports for the GitLab API module

// Re-export key classes for easy access
export { GitLabClient } from './gitlab.client';
export { GitLabConfigBuilder } from './config/gitlab.config';
export { GitLabUtils } from './utils/gitlab.utils';

// Service exports
export { GitLabProjectService } from './services/gitlab-project.service';
export { GitLabRepositoryService } from './services/gitlab-repository.service';
export { GitLabMergeRequestService } from './services/gitlab-merge-request.service';
export { GitLabWebhookService } from './services/gitlab-webhook.service';
export { GitLabPipelineService } from './services/gitlab-pipeline.service';

// Type exports
export * from './types/gitlab.types';
export * from './errors/gitlab.errors'; 
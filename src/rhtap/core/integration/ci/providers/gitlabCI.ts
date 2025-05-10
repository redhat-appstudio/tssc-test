import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';

export class GitLabCI extends BaseCI {
  private componentName: string;

  public getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    if (!pullRequest.repository) {
      console.error('Repository information is missing in the pull request');
      return Promise.resolve(null);
    }
    if (!pipelineStatus) {
      throw new Error('Pipeline status is required');
    }
    if (!eventType) {
      console.warn('Event type is required for GitLab pipelines, defaulting to PULL_REQUEST');
      eventType = EventType.PULL_REQUEST;
    }
    throw new Error('Method not implemented.');
  }
  protected checkPipelineStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline) {
      throw new Error('Pipeline is not defined');
    }
    throw new Error('Method not implemented.');
  }
  public waitForAllPipelinesToFinish(): Promise<void> {
    if (!this.componentName) {
      throw new Error('Component name is not defined');
    }
    throw new Error('Method not implemented.');
  }
  constructor(componentName: string, kubeClient: KubeClient) {
    super(CIType.GITLABCI, kubeClient);
    this.componentName = componentName;
  }

  public async getWebhookUrl(): Promise<string> {
    throw new Error('GitLab does not support webhooks in the same way as other CI systems.');
  }
}

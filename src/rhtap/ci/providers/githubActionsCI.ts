import { KubeClient } from '../../../api/ocp/kubeClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';

export class GitHubActionsCI extends BaseCI {
  private component: string;

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
      console.warn(
        'Event type is required for GitHub Actions pipelines, defaulting to PULL_REQUEST'
      );
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
    if (!this.component) {
      throw new Error('Component is not defined');
    }
    throw new Error('Method not implemented.');
  }
  constructor(component: string, kubeClient: KubeClient) {
    super(CIType.GITHUB_ACTIONS, kubeClient);
    this.component = component;
  }
}

import { KubeClient } from '../ocp/kubeClient';
import { TektonPipelineRunService } from './services/tekton-pipelinerun.service';
import { PipelineRunKind } from '@janus-idp/shared-react';

export class TektonClient {
  private readonly pipelineRunService: TektonPipelineRunService;

  constructor(kubeClient: KubeClient) {
    this.pipelineRunService = new TektonPipelineRunService(kubeClient);
  }

  public async getPipelineRunByCommitSha(
    namespace: string,
    eventType: string,
    commitSha: string,
  ): Promise<PipelineRunKind | null> {
    return this.pipelineRunService.getPipelineRunByCommitSha(
      namespace,
      eventType,
      commitSha,
    );
  }

  public async getPipelineRunByName(
    namespace: string,
    name: string,
  ): Promise<PipelineRunKind | null> {
    return this.pipelineRunService.getPipelineRunByName(namespace, name);
  }

  public async getPipelineRunsByGitRepository(
    namespace: string,
    gitRepository: string,
  ): Promise<PipelineRunKind[]> {
    return this.pipelineRunService.getPipelineRunsByGitRepository(
      namespace,
      gitRepository,
    );
  }

  public async getPipelineRunLogs(
    namespace: string,
    pipelineRunName: string,
  ): Promise<string> {
    return this.pipelineRunService.getPipelineRunLogs(namespace, pipelineRunName);
  }

  public get pipelineRuns(): TektonPipelineRunService {
    return this.pipelineRunService;
  }
}

import { PullRequest } from '../git/models';
import { CI, CIType, EventType, Pipeline, PipelineStatus } from './ciInterface';
import { JenkinsCI } from './providers/jenkinsCI';
import { TektonCI } from './providers/tektonCI';

/**
 * A utility class to handle getting pipelines based on PullRequest objects
 * for different CI providers.
 */
export class PipelineHandler {
  /**
   * Get a pipeline for a given pull request
   * Handles the differences between CI systems and their event type requirements
   *
   * @param pullRequest The pull request object
   * @param ci The CI provider instance
   * @param eventType Optional event type (important for Tekton, ignored by Jenkins)
   * @returns A Promise resolving to a Pipeline object or null if none found
   */
  public static async getPipelineFromPullRequest(
    pullRequest: PullRequest,
    ci: CI,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    const ciType = ci.getCIType();

    switch (ciType) {
      case CIType.TEKTON:
        // Tekton requires an event type
        if (!eventType) {
          console.warn('Tekton CI requires an event type to fetch pipelines');
          return null;
        }
        return this.getTektonPipeline(
          pullRequest,
          ci as TektonCI,
          eventType,
          PipelineStatus.RUNNING
        );

      case CIType.JENKINS:
        // Jenkins ignores the event type
        return this.getJenkinsPipeline(pullRequest, ci as JenkinsCI);

      default:
        console.warn(
          `Getting pipeline from PullRequest for CI type ${ciType} is not yet implemented`
        );
        return null;
    }
  }

  public static async getPipelineFromCommitSha(
    commitSha: string,
    ci: CI
  ): Promise<Pipeline | null> {
    const ciType = ci.getCIType();
    if (commitSha === undefined) {
      console.warn('Commit SHA is undefined');
      return null;
    }
    switch (ciType) {
      case CIType.TEKTON:
        // Tekton requires an event type
        console.warn('Tekton CI requires an event type to fetch pipelines');
        return null;

      case CIType.JENKINS:
        // Jenkins ignores the event type
        //TODO: need to implement this
        // return ci.getPipelinesFromCommitSha(commitSha);
        return null;

      default:
        console.warn(
          `Getting pipeline from commit SHA for CI type ${ciType} is not yet implemented`
        );

        return null;
    }
  }
  /**
   * Get a Tekton pipeline for a given pull request
   * Tekton requires an event type to filter pipeline runs
   */
  private static async getTektonPipeline(
    pullRequest: PullRequest,
    tektonCI: TektonCI,
    eventType: EventType,
    pipelineStatus: PipelineStatus
  ): Promise<Pipeline | null> {
    // Pass the event type explicitly for Tekton
    return tektonCI.getPipeline(pullRequest, pipelineStatus, eventType);
  }

  /**
   * Get a Jenkins pipeline for a given pull request
   * Jenkins doesn't use the event type concept
   */
  private static async getJenkinsPipeline(
    pullRequest: PullRequest,
    jenkinsCI: JenkinsCI
  ): Promise<Pipeline | null> {
    // Don't pass event type to Jenkins - it doesn't use it
    return jenkinsCI.getPipeline(pullRequest, PipelineStatus.RUNNING);
  }
}

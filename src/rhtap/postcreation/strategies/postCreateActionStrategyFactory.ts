import { CIType } from '../../core/integration/ci';
import { EmptyPostCreateActionStrategy } from './emptyPostCreateActionStrategy';
import { GitlabPostCreateActionStrategy } from './gitlab/gitlabPostCreateActionStrategy';
import { JenkinsPostCreateActionStrategy } from './jenkins/jenkinsPostCreateActionStrategy';
import { PostCreateActionStrategy } from './postCreateActionStrategy';
import { TektonPostCreateActionStrategy } from './tekton/tektonPostCreateActionStrategy';

/**
 * Factory class for creating PostCreateActionStrategy instances
 * based on the CI type
 */
export class PostCreateActionStrategyFactory {
  /**
   * Creates a post-create action strategy based on CI type
   * @param ciType Type of CI system
   * @returns An appropriate strategy implementation for the CI type
   */
  public static createStrategy(ciType: CIType): PostCreateActionStrategy {
    switch (ciType) {
      case CIType.JENKINS:
        return new JenkinsPostCreateActionStrategy();
      case CIType.TEKTON:
        // Tekton doesn't require any post-creation actions
        return new TektonPostCreateActionStrategy();
      case CIType.GITHUB_ACTIONS:
        // GitHub Actions doesn't require any post-creation actions
        return new EmptyPostCreateActionStrategy();
      case CIType.GITLABCI:
        // GitLab CI requires configuring a webhook in the repository
        return new GitlabPostCreateActionStrategy();
      default:
        throw new Error(`No post-create action strategy available for CI type: ${ciType}`);
    }
  }
}

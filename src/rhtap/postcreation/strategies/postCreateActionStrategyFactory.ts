import { CIType } from '../../core/integration/ci';
import { AzureCIPostCreateActionStrategy } from './azureCIPostCreateActionStrategy';
import { GithubActionsPostCreateActionStrategy } from './githubActionsPostCreateActionStrategy';
import { GitlabCIPostCreateActionStrategy } from './gitlabCIPostCreateActionStrategy';
import { JenkinsPostCreateActionStrategy } from './jenkinsPostCreateActionStrategy';
import { PostCreateActionStrategy } from './postCreateActionStrategy';
import { TektonPostCreateActionStrategy } from './tektonPostCreateActionStrategy';

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
  //Rules:
  //1. tekton + github ==> no post-creation actions
  //2. tekton + gitlab ==>
  //2. gitlab + gitlabci do not require any post-creation actions
  //3. jenkins requires a webhook to be created in the repository
  public static createStrategy(ciType: CIType): PostCreateActionStrategy {
    switch (ciType) {
      case CIType.JENKINS:
        return new JenkinsPostCreateActionStrategy();
      case CIType.TEKTON:
        // Tekton doesn't require any post-creation actions
        return new TektonPostCreateActionStrategy();
      case CIType.GITHUB_ACTIONS:
        // GitHub Actions doesn't require any post-creation actions
        return new GithubActionsPostCreateActionStrategy();
      case CIType.GITLABCI:
        // GitLab CI requires configuring a webhook in the repository
        return new GitlabCIPostCreateActionStrategy();
      case CIType.AZURE:
        return new AzureCIPostCreateActionStrategy();
      default:
        throw new Error(`No post-create action strategy available for CI type: ${ciType}`);
    }
  }
}

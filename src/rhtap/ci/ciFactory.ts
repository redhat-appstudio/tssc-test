import { KubeClient } from '../../api/ocp/kubeClient';
import { CI, CIType } from './ciInterface';
import { GitHubActionsCI } from './providers/githubActionsCI';
import { GitLabCI } from './providers/gitlabCI';
import { JenkinsCI } from './providers/jenkinsCI';
import { TektonCI } from './providers/tektonCI';

export class CIFactory {
  // Private static instance for singleton pattern
  private static instance: CIFactory;

  // Private constructor to prevent direct instantiation
  private constructor() {}

  // Static method to get the singleton instance
  public static getInstance(): CIFactory {
    if (!CIFactory.instance) {
      CIFactory.instance = new CIFactory();
    }
    return CIFactory.instance;
  }

  private async createTektonCI(componentName: string, kubeClient: KubeClient): Promise<CI> {
    return new TektonCI(componentName, kubeClient);
  }

  private async createGitHubActionsCI(componentName: string, kubeClient: KubeClient): Promise<CI> {
    return new GitHubActionsCI(componentName, kubeClient);
  }

  private async createGitLabCI(componentName: string, kubeClient: KubeClient): Promise<CI> {
    return new GitLabCI(componentName, kubeClient);
  }

  private async createJenkinsCI(componentName: string, kubeClient: KubeClient): Promise<CI> {
    const jenkinsCI = new JenkinsCI(componentName, kubeClient);
    await jenkinsCI.initialize();
    return jenkinsCI;
  }

  public async createCI(type: CIType, componentName: string, kubeClient: KubeClient): Promise<CI> {
    try {
      switch (type) {
        case CIType.TEKTON:
          return await this.createTektonCI(componentName, kubeClient);

        case CIType.GITHUB_ACTIONS:
          return await this.createGitHubActionsCI(componentName, kubeClient);

        case CIType.GITLABCI:
          return await this.createGitLabCI(componentName, kubeClient);

        case CIType.JENKINS:
          return await this.createJenkinsCI(componentName, kubeClient);

        default:
          throw new Error(`Unsupported CI type: ${type}`);
      }
    } catch (error) {
      console.error(`Failed to create CI instance of type ${type}:`, error);
      throw new Error(
        `Failed to create CI instance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Static convenience method that uses the singleton instance
  static async createCI(type: CIType, componentName: string, kubeClient: KubeClient): Promise<CI> {
    return await CIFactory.getInstance().createCI(type, componentName, kubeClient);
  }
}

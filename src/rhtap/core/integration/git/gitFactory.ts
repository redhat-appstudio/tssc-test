import { KubeClient } from '../../../../../src/api/ocp/kubeClient';
import { loadFromEnv } from '../../../../utils/util';
import { Git, GitType } from './gitInterface';
import { BitbucketProvider } from './providers/bitbucket';
import { GithubProvider } from './providers/github';
import { GitlabProvider } from './providers/gitlab';
import { TemplateType } from './templates/templateFactory';

export class GitFactory {
  private constructor() {}

  static async createGit(
    kubeClient: KubeClient,
    type: GitType,
    componentName: string,
    templateType: TemplateType,
  ): Promise<Git> {
    try {
      switch (type) {
        case GitType.GITHUB:
          const github_org = loadFromEnv('GITHUB_ORGANIZATION');
          const github = new GithubProvider(componentName, github_org, templateType, kubeClient);
          await github.initialize();
          return github;
        case GitType.GITLAB:
          const git = new GitlabProvider(componentName, templateType, kubeClient);
          await git.initialize();
          return git;
        case GitType.BITBUCKET:
          const workspace = loadFromEnv('BITBUCKET_WORKSPACE');
          const project = loadFromEnv('BITBUCKET_PROJECT');
          const bitbucket = new BitbucketProvider(
            componentName,
            workspace,
            project,
            kubeClient,
            templateType
          );
          await bitbucket.initialize();
          return bitbucket;
        default:
          throw new Error(`Unsupported Git type: ${type}`);
      }
    } catch (error) {
      console.error(`Failed to create Git instance of type ${type}:`, error);
      throw new Error(
        `Failed to create Git instance: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Export a convenience function that uses the factory class
export async function createGit(
  kubeClient: KubeClient,
  type: GitType,
  componentName: string,
  templateType: TemplateType,
): Promise<Git> {
  return GitFactory.createGit(kubeClient, type, componentName, templateType);
}

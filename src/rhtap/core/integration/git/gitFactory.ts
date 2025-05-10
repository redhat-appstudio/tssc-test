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
    workspace?: string,
    project?: string
  ): Promise<Git> {
    try {
      switch (type) {
        case GitType.GITHUB:
          const github_org = loadFromEnv('GITHUB_ORGANIZATION');
          const github = new GithubProvider(componentName, github_org, templateType, kubeClient);
          return github;
        case GitType.GITLAB:
          //TODO: gitlab group should be retrieved from the secret rhtap-gitlab-integration?
          const gitlab_group = loadFromEnv('GITLAB_GROUP');
          const git = new GitlabProvider(componentName, gitlab_group, templateType, kubeClient);
          await git.initialize();
          return git;
        case GitType.BITBUCKET:
          if (!workspace || !project) {
            throw new Error('Workspace and project are required for Bitbucket');
          }
          const bitbucket_username = loadFromEnv('BITBUCKET_USERNAME');
          return new BitbucketProvider(
            componentName,
            bitbucket_username,
            workspace,
            project,
            kubeClient
          );
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
  workspace?: string,
  project?: string
): Promise<Git> {
  return GitFactory.createGit(kubeClient, type, componentName, templateType, workspace, project);
}

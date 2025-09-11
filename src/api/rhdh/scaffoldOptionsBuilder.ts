import { CIType } from '../../../src/rhtap/core/integration/ci';
import { GitType } from '../../../src/rhtap/core/integration/git';
import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react';

/**
 * Abstract base builder class for ScaffolderScaffoldOptions
 */
export abstract class BaseScaffolderOptionsBuilder<T extends BaseScaffolderOptionsBuilder<any>> {
  protected options: ScaffolderScaffoldOptions;

  constructor(hostType: string) {
    this.options = {
      templateRef: '',
      values: {
        branch: 'main',
        hostType: hostType,
        imageName: '',
        imageOrg: '',
        imageRegistry: '',
        name: '',
        namespace: '',
        owner: 'user:guest',
        repoName: '',
        ciType: '',
      },
    };
  }

  /**
   * Sets the software template name
   */
  withTemplateName(name: string): T {
    this.options.templateRef = `template:default/${name}`;
    return this as unknown as T;
  }

  /**
   * Sets the component name
   */
  withName(name: string): T {
    this.options.values.name = name;
    return this as unknown as T;
  }

  /**
   * Sets the image configuration
   */
  withImageConfig(imageName: string, org: string, registryHost: string): T {
    this.options.values.imageName = imageName;
    this.options.values.imageOrg = org;
    this.options.values.imageRegistry = registryHost;
    return this as unknown as T;
  }

  /**
   * Sets the component namespace
   */
  withNamespace(namespace: string): T {
    this.options.values.namespace = namespace;
    return this as unknown as T;
  }

  /**
   * Sets the CI type
   */
  withCIType(ciType: CIType): T {
    this.options.values.ciType = ciType;
    return this as unknown as T;
  }

  /**
   * Sets the Azure project
   */
  withAzureProject(azureProject: string): T {
    this.options.values.azureProject = azureProject;
    return this as unknown as T;
  }

  /**
   * Builds and returns the final ScaffolderScaffoldOptions
   */
  build(): ScaffolderScaffoldOptions {
    return this.options;
  }

  /**
   * Configures Git repository details - to be implemented by derived classes
   */
  abstract forGitRepo(...args: any[]): T;
}

/**
 * GitHub-specific scaffold options builder
 */
export class GithubScaffolderOptionsBuilder extends BaseScaffolderOptionsBuilder<GithubScaffolderOptionsBuilder> {
  constructor() {
    super('GitHub');
  }

  /**
   * Configures for GitHub repository
   */
  forGitRepo(
    owner: string,
    repoName: string,
    host: string = 'github.com'
  ): GithubScaffolderOptionsBuilder {
    this.options.values.ghHost = host;
    this.options.values.ghOwner = owner;
    this.options.values.repoName = repoName;
    return this;
  }
}

/**
 * GitLab-specific scaffold options builder
 */
export class GitlabScaffolderOptionsBuilder extends BaseScaffolderOptionsBuilder<GitlabScaffolderOptionsBuilder> {
  constructor() {
    super('GitLab');
  }

  /**
   * Configures for GitLab repository
   */
  forGitRepo(
    group: string,
    repoName: string,
    host: string = 'gitlab.com'
  ): GitlabScaffolderOptionsBuilder {
    this.options.values.glHost = host;
    this.options.values.glOwner = group;
    this.options.values.repoName = repoName;
    return this;
  }
}

/**
 * Bitbucket-specific scaffold options builder
 */
export class BitbucketScaffolderOptionsBuilder extends BaseScaffolderOptionsBuilder<BitbucketScaffolderOptionsBuilder> {
  constructor() {
    super('Bitbucket');
  }

  /**
   * Configures for Bitbucket repository
   */
  forGitRepo(
    username: string,
    workspace: string,
    project: string,
    repoName: string,
    host: string = 'bitbucket.org'
  ): BitbucketScaffolderOptionsBuilder {
    this.options.values.bbHost = host;
    this.options.values.bbOwner = username;
    this.options.values.workspace = workspace;
    this.options.values.project = project;
    this.options.values.repoName = repoName;
    return this;
  }
}

/**
 * Factory function to create the appropriate builder based on git provider type
 */
export function createScaffolderOptionsBuilder(
  gitType: GitType
): BaseScaffolderOptionsBuilder<any> {
  switch (gitType) {
    case GitType.GITHUB:
      return new GithubScaffolderOptionsBuilder();
    case GitType.GITLAB:
      return new GitlabScaffolderOptionsBuilder();
    case GitType.BITBUCKET:
      return new BitbucketScaffolderOptionsBuilder();
    default:
      throw new Error(`Unsupported git provider type: ${gitType}`);
  }
}

/**
 * Public API export - use this function name for backward compatibility
 */
export { createScaffolderOptionsBuilder as ScaffolderOptionsBuilder };

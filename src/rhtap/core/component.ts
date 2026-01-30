import { KubeClient } from '../../api/ocp/kubeClient';
import { DeveloperHub } from '../../api/rhdh/developerhub';
import { ScaffolderOptionsBuilder } from '../../api/rhdh/scaffoldOptionsBuilder';
import { TSSC_APP_DEPLOYMENT_NAMESPACE } from '../../constants';
import { TestItem } from '../../playwright/testItem';
import { ArgoCD, Environment } from '../core/integration/cd/argocd';
import { CI, CIFactory, CIType } from '../core/integration/ci';
import { Git, GitType, GithubProvider, GitlabProvider } from '../core/integration/git';
import { createGit } from '../core/integration/git';
import { BitbucketProvider } from '../core/integration/git';
import { ImageRegistry, createRegistry } from '../core/integration/registry';
import { ScaffolderScaffoldOptions } from '@backstage/plugin-scaffolder-react';

export class Component {
  private name: string;
  private kubeClient!: KubeClient;
  private developerHub!: DeveloperHub;
  private ci!: CI;
  private registry!: ImageRegistry;
  private id!: string;
  private git!: Git;
  private isCreated = false;
  private cd!: ArgoCD;

  private constructor(name: string) {
    this.name = name;
  }

  /**
   * Creates a new component in the Developer Hub.
   *
   * @param name The name of the component.
   * @param testItem The test item containing configuration details.
   * @param repoOwner The owner of the repository:
   *                  - GitHub: Organization or user name
   *                  - GitLab: Group name
   *                  - Bitbucket: Workspace name
   * @param imageOrgName The organization name for the image registry.
   * @param imageName The name of the image.
   * @param createComponent Whether to create the component or just assign the component to the existing one.
   * @param workspace Optional workspace name for Bitbucket.
   * @param project Optional project name for Bitbucket.
   */
  public static async new(
    name: string,
    testItem: TestItem,
    imageName: string,
    createComponent: boolean = true,
  ): Promise<Component> {
    const component = new Component(name);

    try {
      // Initialize KubeClient inside the try-catch block with skipTLSVerify enabled
      component.kubeClient = new KubeClient();
      // Initialize CI, image registry and git properties
      component.ci = await CIFactory.createCI(
        testItem.getCIType(),
        component.name,
        component.kubeClient
      );
      component.registry = await createRegistry(
        testItem.getRegistryType(),
        imageName,
        component.kubeClient
      );
      component.git = await createGit(
        component.kubeClient,
        testItem.getGitType(),
        component.name,
        testItem.getTemplate()
      );

      component.cd = new ArgoCD(component.name, component.kubeClient);
      // Initialize developer hub and create component
      component.developerHub = await component.createDeveloperHub();

      const componentOptions = component.createComponentOptions(
        testItem,
        component.registry,
        component.ci,
        component.git
      );

      if (createComponent) {
        // Store response from createComponent call
        const response = await component.developerHub.createComponent(componentOptions);
        if (!response || !response.id) {
          throw new Error('Failed to create component: No valid response or component ID received');
        }

        component.id = response.id;
        console.log(
          `Component creation started. Component Name: ${component.name}, ID: ${component.id}`
        );
      }

      component.isCreated = true;
      return component;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to create component '${name}': ${errorMessage}`);
      throw new Error(`Component creation failed: ${errorMessage}`);
    }
  }

  /**
   * Waits until the component is completed.
   * Throws an error if the component has not been created yet.
   */
  public async waitUntilComponentIsCompleted(): Promise<void> {
    if (!this.isCreated) {
      throw new Error('Component has not been created yet.');
    }
    console.log(`Waiting for component ${this.name} to be completed...`);
    await this.developerHub.waitUntilComponentIsCompleted(this.id);
  }

  /**
   * Waits until the initial CI deployment is synced and healthy.
   * This should be called after waitUntilComponentIsCompleted() to ensure
   * the ArgoCD application has successfully deployed to the CI environment.
   *
   * The CI application is automatically synced during component creation,
   * this method just waits for that sync to complete.
   *
   * @param maxRetries Maximum number of retry attempts (default: 12)
   * @param retryDelayMs Delay between retries in milliseconds (default: 10000)
   * @throws Error if the component has not been created yet or if sync fails
   */
  public async waitUntilInitialDeploymentIsSynced(
    maxRetries: number = 12,
    retryDelayMs: number = 10000
  ): Promise<void> {
    if (!this.isCreated) {
      throw new Error('Component has not been created yet.');
    }

    try {
      console.log(`Waiting for initial CI deployment of ${this.name}...`);

      // Get the initial gitops commit SHA
      const commitSha = await this.git.getGitOpsRepoCommitSha();
      console.log(`Waiting for ArgoCD CI application to sync to commit: ${commitSha}`);

      // Wait for the automatic sync to complete (no manual sync trigger needed)
      const syncResult = await this.cd.waitUntilApplicationIsSynced(
        Environment.DEVELOPMENT,
        commitSha,
        maxRetries,
        retryDelayMs
      );

      if (!syncResult.synced) {
        throw new Error(
          `Initial CI deployment failed to sync. ` +
            `Status: ${syncResult.status}. Reason: ${syncResult.message}`
        );
      }

      console.log(`Initial CI deployment completed successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to wait for initial CI deployment: ${errorMessage}`);
      throw new Error(`Initial CI deployment sync failed: ${errorMessage}`);
    }
  }

  /**
   * Creates a Developer Hub instance and connects to it.
   * Throws an error if the connection fails.
   *
   * @returns a DeveloperHub instance.
   * @throws Error if the connection fails.
   */
  private async createDeveloperHub(): Promise<DeveloperHub> {
    const routeHostname = await this.kubeClient.getOpenshiftRoute(
      'backstage-developer-hub',
      'tssc-dh'
    );
    const developerHubUrl = `https://${routeHostname}`;
    const developerHub = new DeveloperHub(developerHubUrl);

    console.log(`Connected to Developer Hub at: ${developerHub.getUrl()}`);
    return developerHub;
  }

  /**
   * Creates component options based on the test item and other parameters.
   *
   * @param testItem The test item containing configuration details.
   * @param registry The image registry instance.
   * @param ci The {@link CI} instance.
   * @param git The ${@link GIT}  instance.
   * @returns {@link ScaffolderScaffoldOptions} object with the component options.
   */
  private createComponentOptions(
    testItem: TestItem,
    registry: ImageRegistry,
    ci: CI,
    git: Git
  ): ScaffolderScaffoldOptions {
    const template = testItem.getTemplate();

    let builder: any;
    switch (testItem.getGitType()) {
      case GitType.GITHUB:
        const github = git as unknown as GithubProvider;
        builder = ScaffolderOptionsBuilder(GitType.GITHUB)
          .withTemplateName(template)
          .withName(git.getSourceRepoName())
          .withImageConfig(
            registry.getImageName(),
            registry.getOrganization(),
            registry.getRegistryHost()
          )
          .withCIType(ci.getCIType())
          .withNamespace(TSSC_APP_DEPLOYMENT_NAMESPACE)
          .forGitRepo(github.getOrganization(), github.getSourceRepoName());
        break;
      case GitType.GITLAB:
        const gitlab = git as unknown as GitlabProvider;
        builder = ScaffolderOptionsBuilder(GitType.GITLAB)
          .withTemplateName(template)
          .withName(git.getSourceRepoName())
          .withImageConfig(
            registry.getImageName(),
            registry.getOrganization(),
            registry.getRegistryHost()
          )
          .withCIType(ci.getCIType())
          .withNamespace(TSSC_APP_DEPLOYMENT_NAMESPACE)
          .forGitRepo(gitlab.getGroup(), gitlab.getSourceRepoName());
        break;
      case GitType.BITBUCKET:
        const bitbucket = git as unknown as BitbucketProvider;
        const repoName = bitbucket.getSourceRepoName();
        const workspaceName = bitbucket.getWorkspace();
        const projectName = bitbucket.getProject();
        const username = bitbucket.getUsername();
        builder = ScaffolderOptionsBuilder(GitType.BITBUCKET)
          .withTemplateName(template)
          .withName(repoName)
          .withImageConfig(
            registry.getImageName(),
            registry.getOrganization(),
            registry.getRegistryHost()
          )
          .withCIType(ci.getCIType())
          .withNamespace(TSSC_APP_DEPLOYMENT_NAMESPACE)
          .forGitRepo(username, workspaceName, projectName, repoName);
        break;
      default:
        throw new Error(`Unsupported git type: ${testItem.getGitType()}`);
    }

    if (ci.getCIType() == CIType.AZURE) {
      builder.withAzureProject('shared-public');
    }

    return builder.build();
  }

  public getCI(): CI {
    if (!this.isCreated) {
      throw new Error('Component has not been created yet.');
    }
    return this.ci;
  }

  public getRegistry(): ImageRegistry {
    if (!this.isCreated) {
      throw new Error('Component has not been created yet.');
    }
    return this.registry;
  }

  public getGit(): Git {
    if (!this.isCreated) {
      throw new Error('Component has not been created yet.');
    }
    return this.git;
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public async getStatus(): Promise<string> {
    if (!this.isCreated) {
      throw new Error('Component has not been created yet.');
    }
    return this.developerHub.getComponentStatus(this.id);
  }

  public getDeveloperHub(): DeveloperHub {
    return this.developerHub;
  }

  public getKubeClient(): KubeClient {
    return this.kubeClient;
  }

  public getCD(): ArgoCD {
    return this.cd;
  }
}

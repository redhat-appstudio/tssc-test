import { KubeClient } from '../api/ocp/kubeClient';
import { ACS } from './acs';
import { CIType, JenkinsCI } from './ci';
import { Component } from './component';
import { Git } from './git';
import { ContentModificationsContainer } from './modification/contentModification';
import { JenkinsfileModifier } from './modification/jenkinsfile';
import { RhtapEnvModifier } from './modification/rhtap-env';
import { TAS } from './tas';

/**
 * Handles post-creation actions for components based on CI and Git provider combinations
 */
export class ComponentPostCreateAction {
  private component: Component;
  private kubeClient: KubeClient;

  constructor(component: Component) {
    this.component = component;
    this.kubeClient = component.getKubeClient();
  }

  /**
   * Executes appropriate post-creation actions based on the component's CI and Git provider
   */
  public async execute(): Promise<void> {
    const ciType = this.component.getCI().getCIType();
    const gitType = this.component.getGit().getGitType();

    console.log(`Executing post-creation actions for CI: ${ciType}, Git: ${gitType}`);
    if (ciType === CIType.JENKINS) {
      const git = this.component.getGit();
      await this.executeJenkinsActions(git);
    }
  }

  /**
   * Executes post-creation actions for Jenkins CI
   */
  private async executeJenkinsActions(git: Git): Promise<void> {
    await this.createJenkinsJobs(this.component.getCI() as JenkinsCI);
    console.log('Jenkins jobs created successfully');

    await this.applyChangesToSourceRepoForJenkinsCI(git);
    console.log('Changes applied to the source repository successfully');
    await this.applyChangesToGitOpsRepoForJenkinsCI(git);
  }

  private async getCosignPublicKey(): Promise<string> {
    const secret = await this.kubeClient.getSecret('signing-secrets', 'openshift-pipelines');
    if (!secret) {
      console.error('Failed to retrieve the secret');
      throw new Error('Secret signing-secrets under namespace openshift-pipelines not found');
    }
    const key = secret['cosign.pub'];
    if (!key) {
      console.error('Failed to retrieve the cosign public key from the secret');
      throw new Error('Cosign public key not found in the secret');
    }
    return key;
  }

  private async createJenkinsJobs(jenkinsCI: JenkinsCI): Promise<void> {
    // Implement Jenkins job creation logic here
    console.log('Creating Jenkins jobs...');
    const folderName = this.component.getName();
    await jenkinsCI.createFolder(folderName);

    console.log(`Jenkins jobs created in folder: ${folderName}`);
    const sourceRepoJobName = this.component.getName();
    const gitOpsRepoJobName = `${this.component.getName()}-gitops`;
    //TODO: not done yet
    const sourceRepoURL = sourceRepoJobName;
    const gitOpsRepoURL = gitOpsRepoJobName;

    await jenkinsCI.createJob(sourceRepoJobName, folderName, sourceRepoURL);
    await jenkinsCI.createJob(gitOpsRepoJobName, folderName, gitOpsRepoURL);
  }

  // apply additional changes to the source repository when Ci is Jenkins
  private async applyChangesToSourceRepoForJenkinsCI(git: Git): Promise<void> {
    console.log('Applying additional changes to the source repository...');
    const imageRegistry = this.component.getRegistry();

    // Initialize TAS and ACS
    const tas = await TAS.initialize(this.kubeClient);
    const acs = await ACS.initialize(this.kubeClient);
    const cosignPublicKey = await this.getCosignPublicKey();
    const imageRegistryUser = imageRegistry.getImageRegistryUser();

    // Get the TAS and ACS values (these are synchronous methods, not Promises)
    const tufMirrorURL = tas.getTufMirrorURL();
    const rokorServerURL = tas.getRokorServerURL();
    const roxCentralEndpoint = acs.getRoxCentralEndpoint();

    // Create the modifications
    const jenkinsfileModification = JenkinsfileModifier.create()
      .updateKubernetesAgentConfig()
      .enableRegistryPassword()
      .disableQuayCredentials()
      .getModifications();

    // Create the rhtap/env.sh modifications
    const rhtapenvModification = RhtapEnvModifier.create()
      .enableACS()
      .updateTUFMirrorURL(tufMirrorURL)
      .updateRokorServerURL(rokorServerURL)
      .updateRoxCentralEndpoint(roxCentralEndpoint)
      .updateCosignPublicKey(cosignPublicKey)
      .updateImageRegistryUser(imageRegistryUser)
      .getModifications();

    // Create a container for modifications
    const modificationsContainer = new ContentModificationsContainer();
    modificationsContainer.merge(jenkinsfileModification);
    modificationsContainer.merge(rhtapenvModification);
    const contentModifications = modificationsContainer.getModifications();

    // Commit the modifications to source repository
    console.log('Committing changes to the source repository...');
    await git.commitChangesToRepo(
      git.getRepoOwner(),
      git.getSourceRepoName(),
      contentModifications,
      'Update Jenkinsfile and rhtap/env.sh for source repository'
    );
    console.log('Additional changes applied successfully to the source repository.');
  }

  // apply additional changes to the GitOps repository when Ci is Jenkins
  private async applyChangesToGitOpsRepoForJenkinsCI(git: Git): Promise<void> {
    console.log('Applying additional changes to the GitOps repository...');
    const imageRegistry = this.component.getRegistry();

    // Initialize TAS and ACS
    const tas = await TAS.initialize(this.kubeClient);
    const acs = await ACS.initialize(this.kubeClient);
    const cosignPublicKey = await this.getCosignPublicKey();
    const imageRegistryUser = imageRegistry.getImageRegistryUser();
    const tufMirrorURL = tas.getTufMirrorURL();
    const rokorServerURL = tas.getRokorServerURL();
    const roxCentralEndpoint = acs.getRoxCentralEndpoint();

    // Create the modifications
    const jenkinsfileModification = JenkinsfileModifier.create()
      .updateKubernetesAgentConfig()
      .disableCosignPublicKey()
      .enableRegistryPassword()
      .disableQuayCredentials()
      .getModifications();

    // Create the rhtap/env.sh modifications
    const rhtapenvModification = RhtapEnvModifier.create()
      .enableACS()
      .updateTUFMirrorURL(tufMirrorURL)
      .updateRokorServerURL(rokorServerURL)
      .updateRoxCentralEndpoint(roxCentralEndpoint)
      .updateCosignPublicKey(cosignPublicKey)
      .updateImageRegistryUser(imageRegistryUser)
      .getModifications();

    // Create a container for modifications
    const modificationsContainer = new ContentModificationsContainer();
    modificationsContainer.merge(jenkinsfileModification);
    modificationsContainer.merge(rhtapenvModification);
    const contentModifications = modificationsContainer.getModifications();

    console.log('Committing changes to the GitOps repository...');
    await git.commitChangesToRepo(
      git.getRepoOwner(),
      git.getGitOpsRepoName(),
      contentModifications,
      'Update Jenkinsfile and rhtap/env.sh for GitOps repository'
    );
    console.log('Additional changes applied successfully to the GitOps repository.');
  }
}

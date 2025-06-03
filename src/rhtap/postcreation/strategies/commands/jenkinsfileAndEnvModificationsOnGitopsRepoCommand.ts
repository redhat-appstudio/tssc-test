import { Component } from '../../../core/component';
import {
  ContentModifications,
  ContentModificationsContainer,
} from '../../../modification/contentModification';
import JenkinsfileModifier from '../../../modification/jenkinsfile';
import { RhtapEnvModifier } from '../../../modification/rhtap-env';
import { BaseCommand } from './baseCommand';

/**
 * Command to apply modifications to GitOps repository
 */
export class JenkinsfileAndEnvModificationsOnGitopsRepoCommand extends BaseCommand {
  constructor(component: Component) {
    super(component);
  }

  public async execute(): Promise<void> {
    this.logStart('source repository modifications');

    await this.ensureServicesInitialized();
    const modifications = await this.getGitOpsRepoModifications();
    await this.commitChanges(
      this.git.getGitOpsRepoName(),
      modifications,
      'Update Gitops repository'
    );

    this.logComplete('Gitops repository modifications');
  }

  private async getGitOpsRepoModifications(): Promise<ContentModifications> {
    const cosignPublicKey = await this.credentialService.getCosignPublicKey();
    const modificationsContainer = new ContentModificationsContainer();

    modificationsContainer.merge(
      JenkinsfileModifier.create()
        .updateKubernetesAgentConfig()
        .enableRegistryPassword()
        .disableQuayCredentials()
        .enableTPAVariables()
        .getModifications()
    );

    modificationsContainer.merge(
      RhtapEnvModifier.create()
        .updateTUFMirrorURL(this.tas.getTufMirrorURL())
        .updateRokorServerURL(this.tas.getRekorServerURL())
        .updateRoxCentralEndpoint(this.acs.getRoxCentralEndpoint())
        .updateCosignPublicKey(cosignPublicKey)
        .updateImageRegistryUser(this.component.getRegistry().getImageRegistryUser())
        .getModifications()
    );

    return modificationsContainer.getModifications();
  }

  private async commitChanges(
    repoName: string,
    modifications: ContentModifications,
    message: string
  ): Promise<void> {
    console.log(`Committing changes to ${repoName}...`);
    await this.git.commitChangesToRepo(this.git.getRepoOwner(), repoName, modifications, message);
    console.log(`Changes committed to ${repoName} successfully.`);
  }
}

import { Component } from '../../../core/component';
import {
  ContentModifications,
  ContentModificationsContainer,
} from '../../../modification/contentModification';
import { JenkinsfileModifier } from '../../../modification/jenkinsfile';
import { RhtapEnvModifier } from '../../../modification/rhtap-env';
import { BaseCommand } from './baseCommand';

/**
 * Command to apply modifications to source repository
 *
 * This command applies necessary modifications to the source code repository:
 * 1. Updates the Jenkinsfile with required configuration changes
 * 2. Updates TSSC environment files with integration endpoints and credentials
 *
 * Part of the post-creation workflow for setting up Jenkins pipeline requirements.
 */
export class JenkinsfileAndEnvModificationsOnSourceRepoCommand extends BaseCommand {
  constructor(component: Component) {
    super(component);
  }

  public async execute(): Promise<void> {
    this.logStart('source repository modifications');

    await this.ensureServicesInitialized();
    const modifications = await this.getSourceRepoModifications();
    await this.commitChanges(
      this.git.getSourceRepoName(),
      modifications,
      'Update source repository'
    );

    this.logComplete('source repository modifications');
  }

  private async getSourceRepoModifications(): Promise<ContentModifications> {
    const cosignPublicKey = await this.credentialService.getCosignPublicKey();
    const modificationsContainer = new ContentModificationsContainer();

    modificationsContainer.merge(
      JenkinsfileModifier.create()
        .updateKubernetesAgentConfig()
        .enableRegistryPassword()
        .disableQuayCredentials()
        .getModifications()
    );

    modificationsContainer.merge(
      RhtapEnvModifier.create()
        .updateTUFMirrorURL(this.tas.getTufMirrorURL())
        .updateRokorServerURL(this.tas.getRokorServerURL())
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

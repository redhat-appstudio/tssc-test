import { Component } from '../../../core/component';
import {
  ContentModifications,
  ContentModificationsContainer,
} from '../../../modification/contentModification';
import JenkinsfileModifier from '../../../modification/jenkinsfile';
import { BaseCommand } from './baseCommand';
import { LoggerFactory } from '../../../../logger/factory/loggerFactory';
import { Logger } from '../../../../logger/logger';

/**
 * Command to apply modifications to GitOps repository
 */
export class JenkinsfileAndEnvModificationsOnGitopsRepoCommand extends BaseCommand {
  protected readonly logger: Logger = LoggerFactory.getLogger('postcreation.command.jenkins.gitops-repo');
  
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
    const modificationsContainer = new ContentModificationsContainer();

    modificationsContainer.merge(
      JenkinsfileModifier.create()
        .enableRegistryPassword()
        .disableQuayCredentials()
        .enableGitoAuthUsername()
        .getModifications()
    );

    return modificationsContainer.getModifications();
  }

  private async commitChanges(
    repoName: string,
    modifications: ContentModifications,
    message: string
  ): Promise<void> {
    this.logger.info('Committing changes to {}...', repoName);
    await this.git.commitChangesToRepo(this.git.getRepoOwner(), repoName, modifications, message);
    this.logger.info('Changes committed to {} successfully.', repoName);
  }
}

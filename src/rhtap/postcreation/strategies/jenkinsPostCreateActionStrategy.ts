import { Component } from '../../core/component';
import { AddJenkinsSecretsCommand } from './commands/addJenkinsSecretsCommand';
import { CreateJenkinsFolderCommand } from './commands/createJenkinsFolderCommand';
import { CreateJenkinsJobsCommand } from './commands/createJenkinsJobsCommand';
import { CreateWebhookCommand } from './commands/createWebhookCommand';
import { JenkinsfileAndEnvModificationsOnGitopsRepoCommand } from './commands/jenkinsfileAndEnvModificationsOnGitopsRepoCommand';
import { JenkinsfileAndEnvModificationsOnSourceRepoCommand } from './commands/jenkinsfileAndEnvModificationsOnSourceRepoCommand';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';
import { UpdateCIRunnerImage } from './commands/updateCIRunnerImage';
import { UncommentCustomRootCA } from './commands/uncommentCustomRootCA';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

/**
 * Jenkins-specific implementation of post-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class JenkinsPostCreateActionStrategy implements ComponentActionStrategy {
  private readonly logger: Logger = LoggerFactory.getLogger('postcreation.strategy.jenkins');
  
  constructor() {}

  /**
   * Executes Jenkins-specific post-creation actions
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    const folderName = component.getName();
    this.logger.info('Executing Jenkins post-creation actions for component: {}', folderName);

    try {
      // Create command instances
      const commands = [
        new CreateJenkinsFolderCommand(component),
        new JenkinsfileAndEnvModificationsOnSourceRepoCommand(component),
        new JenkinsfileAndEnvModificationsOnGitopsRepoCommand(component),
        new AddJenkinsSecretsCommand(component),
        new CreateJenkinsJobsCommand(component),
        new CreateWebhookCommand(component),
        new UpdateCIRunnerImage(component),
        new UncommentCustomRootCA(component),
        //First run must be triggered manually:
        // https://stackoverflow.com/questions/56714213/jenkins-not-triggered-by-github-webhook#comment109322558_60625199
        // new TriggerJenkinsJobCommand(component),// 18/09/2025:  We decided to trigger the Jenkins job manually without using Jenkins Plugins
      ];

      // Execute commands sequentially
      for (const command of commands) {
        await command.execute();
      }

      this.logger.info('Jenkins post-creation actions completed successfully for {}', folderName);
    } catch (error) {
      this.logger.error('Error executing Jenkins post-creation actions: {}', error);
      throw new Error(
        `Jenkins post-creation actions failed: ${error}`
      );
    }
  }
}

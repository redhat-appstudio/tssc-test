import { Component } from '../../core/component';
import { AddJenkinsSecretsCommand } from './commands/addJenkinsSecretsCommand';
import { CreateJenkinsFolderCommand } from './commands/createJenkinsFolderCommand';
import { CreateJenkinsJobsCommand } from './commands/createJenkinsJobsCommand';
import { CreateWebhookCommand } from './commands/createWebhookCommand';
import { JenkinsfileAndEnvModificationsOnGitopsRepoCommand } from './commands/jenkinsfileAndEnvModificationsOnGitopsRepoCommand';
import { JenkinsfileAndEnvModificationsOnSourceRepoCommand } from './commands/jenkinsfileAndEnvModificationsOnSourceRepoCommand';
import { TriggerJenkinsJobCommand } from './commands/triggerJenkinsJobCommand';
import { PostCreateActionStrategy } from './postCreateActionStrategy';

/**
 * Jenkins-specific implementation of post-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class JenkinsPostCreateActionStrategy implements PostCreateActionStrategy {
  constructor() {}

  /**
   * Executes Jenkins-specific post-creation actions
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    const folderName = component.getName();
    console.log(`Executing Jenkins post-creation actions for component: ${folderName}`);

    try {
      // Create command instances
      const commands = [
        new CreateJenkinsFolderCommand(component),
        new JenkinsfileAndEnvModificationsOnSourceRepoCommand(component),
        new JenkinsfileAndEnvModificationsOnGitopsRepoCommand(component),
        new AddJenkinsSecretsCommand(component),
        new CreateJenkinsJobsCommand(component),
        new CreateWebhookCommand(component),
        //First run must be triggered manually:
        // https://stackoverflow.com/questions/56714213/jenkins-not-triggered-by-github-webhook#comment109322558_60625199 
        new TriggerJenkinsJobCommand(component),
      ];

      // Execute commands sequentially
      for (const command of commands) {
        await command.execute();
      }

      console.log(`Jenkins post-creation actions completed successfully for ${folderName}`);
    } catch (error) {
      console.error(`Error executing Jenkins post-creation actions: ${error}`);
      throw new Error(
        `Jenkins post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

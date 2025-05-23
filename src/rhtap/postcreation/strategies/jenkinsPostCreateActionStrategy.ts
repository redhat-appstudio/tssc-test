import { Component } from '../../core/component';
import { PostCreateActionStrategy } from './postCreateActionStrategy';
import { AddJenkinsSecretsCommand } from './commands/addJenkinsSecretsCommand';
import { ApplyGitOpsRepoModificationsCommand } from './commands/applyGitOpsRepoModificationsCommand';
import { ApplySourceRepoModificationsCommand } from './commands/applySourceRepoModificationsCommand';
import { CreateWebhookCommand } from './commands/createWebhookCommand';
import { CreateJenkinsFolderCommand } from './commands/createJenkinsFolderCommand';
import { CreateJenkinsJobsCommand } from './commands/createJenkinsJobsCommand';

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
        new ApplySourceRepoModificationsCommand(component),
        new ApplyGitOpsRepoModificationsCommand(component),
        new AddJenkinsSecretsCommand(component),
        new CreateJenkinsJobsCommand(component),
        new CreateWebhookCommand(component),
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

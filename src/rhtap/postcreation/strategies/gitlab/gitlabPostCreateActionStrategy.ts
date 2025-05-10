import { Component } from '../../../core/component';
import { PostCreateActionStrategy } from '../postCreateActionStrategy';
import { CreateWebhookCommand } from '../tekton/commands/createWebhookCommand';

/**
 * GitLab-specific implementation of post-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class GitlabPostCreateActionStrategy implements PostCreateActionStrategy {
  constructor() {}

  /**
   * Executes GitLab-specific post-creation actions
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    const folderName = component.getName();
    console.log(`Executing GitLab post-creation actions for component: ${folderName}`);

    try {
      // Create command instances
      const commands = [
        new CreateWebhookCommand(component)
      ];

      // Execute commands sequentially
      for (const command of commands) {
        await command.execute();
      }
      
      console.log(`GitLab post-creation actions completed successfully for ${folderName}`);
    } catch (error) {
      console.error(`Error executing GitLab post-creation actions: ${error}`);
      throw new Error(`GitLab post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

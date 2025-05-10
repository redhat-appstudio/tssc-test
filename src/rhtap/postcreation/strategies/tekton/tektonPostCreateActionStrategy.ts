import { Component } from '../../../core/component';
import { GitType } from '../../../core/integration/git';
import { PostCreateActionStrategy } from '../postCreateActionStrategy';
import { CreateWebhookCommand } from './commands/createWebhookCommand';

/**
 * A "null object" implementation of PostCreateActionStrategy
 * Used for CI types that don't require any post-creation actions (like Tekton)
 */
export class TektonPostCreateActionStrategy implements PostCreateActionStrategy {
  /**
   * No-op implementation - doesn't perform any post-creation actions
   * @param component The component to process
   */
  public async execute(component: Component): Promise<void> {
    const git = component.getGit();
    if (git.getGitType() === GitType.GITHUB) {
      console.log(`No post-creation actions needed for component: ${component.getName()}`);
    } else if (git.getGitType() === GitType.GITLAB) {
      console.log(`post-creation actions needed for component: ${component.getName()}`);
    
      try {
        // Create command instances
        const commands = [
          new CreateWebhookCommand(component)
        ];
           // Execute commands sequentially
        for (const command of commands) {
          await command.execute();
        }
        
        console.log(`GitLab post-creation actions completed successfully for ${component.getName()}`);
      } catch (error) {
        console.error(`Error executing GitLab post-creation actions: ${error}`);
        throw new Error(`GitLab post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

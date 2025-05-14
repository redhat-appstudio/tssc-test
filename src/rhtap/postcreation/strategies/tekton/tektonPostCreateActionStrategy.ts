import { Component } from '../../../core/component';
import { GitType } from '../../../core/integration/git';
import { PostCreateActionStrategy } from '../postCreateActionStrategy';
import { CreateWebhookCommand } from './commands/createWebhookCommand';

/**
 * Interface for commands that can be executed as post-creation actions
 */
interface Command {
  execute(): Promise<void>;
}

/**
 * Implementation of PostCreateActionStrategy for Tekton CI
 * Handles post-creation actions based on the Git provider type
 * 
 * Note: WebHook configuration is only needed for GitLab and Bitbucket providers.
 * GitHub and other providers do not require any post-creation actions.
 */
export class TektonPostCreateActionStrategy implements PostCreateActionStrategy {
  /**
   * Executes appropriate post-creation actions based on the Git provider
   * Only GitLab and Bitbucket providers require webhook configuration
   * 
   * @param component The component to process
   */
  public async execute(component: Component): Promise<void> {
    const git = component.getGit();
    const gitType = git.getGitType();
    const componentName = component.getName();

    switch (gitType) {
      case GitType.GITLAB:
        await this.executeGitLabActions(component);
        break;
      case GitType.BITBUCKET:
        await this.executeBitbucketActions(component);
        break;
      case GitType.GITHUB:
      default:
        console.log(`No post-creation actions needed for component: ${componentName}`);
        break;
    }
  }

  /**
   * Creates and returns an array of webhook configuration commands
   * Currently only creates webhook command, but can be extended with additional commands if needed
   * 
   * @param component The component for which webhook commands should be created
   * @returns Array of Command instances for webhook configuration
   */
  private createWebhookCommands(component: Component): Command[] {
    return [
      new CreateWebhookCommand(component)
    ];
  }

  /**
   * Executes post-creation actions for GitLab repositories
   * @param component The component to process
   * @throws Error if any action fails
   */
  private async executeGitLabActions(component: Component): Promise<void> {
    const componentName = component.getName();
    console.log(`Post-creation actions needed for component: ${componentName}`);
    
    try {
      const commands = this.createWebhookCommands(component);
      await this.executeCommands(commands);
      console.log(`GitLab post-creation actions completed successfully for ${componentName}`);
    } catch (error) {
      console.error(`Error executing GitLab post-creation actions: ${error}`);
      throw new Error(`GitLab post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes post-creation actions for Bitbucket repositories
   * @param component The component to process
   * @throws Error if any action fails
   */
  private async executeBitbucketActions(component: Component): Promise<void> {
    const componentName = component.getName();
    console.log(`Post-creation actions needed for component: ${componentName}`);
    
    try {
      const commands = this.createWebhookCommands(component);
      await this.executeCommands(commands);
      console.log(`Bitbucket post-creation actions completed successfully for ${componentName}`);
    } catch (error) {
      console.error(`Error executing Bitbucket post-creation actions: ${error}`);
      throw new Error(`Bitbucket post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes an array of commands sequentially
   * @param commands Array of Command instances to execute
   */
  private async executeCommands(commands: Command[]): Promise<void> {
    for (const command of commands) {
      await command.execute();
    }
  }
}

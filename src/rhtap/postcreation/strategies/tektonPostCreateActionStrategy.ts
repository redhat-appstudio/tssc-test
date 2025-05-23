import { Component } from '../../core/component';
import { GitType } from '../../core/integration/git';
import { PostCreateActionStrategy } from './postCreateActionStrategy';
import { Command } from './commands/command';
import { CreateWebhookCommand } from './commands/createWebhookCommand';

/**
 * Implementation of PostCreateActionStrategy for Tekton CI
 * Handles post-creation actions based on the Git provider type
 * 
 * Note: WebHook configuration is only needed for GitLab and Bitbucket providers.
 * GitHub and other providers do not require any post-creation actions.
 */
export class TektonPostCreateActionStrategy implements PostCreateActionStrategy {
  /**
   * Map of Git provider types to their handler functions
   * This allows for easy extension with new Git providers
   */
  private readonly gitProviderHandlers: Record<GitType, (component: Component) => Promise<void>> = {
    [GitType.GITLAB]: this.handleGitProviderActions.bind(this),
    [GitType.BITBUCKET]: this.handleGitProviderActions.bind(this),
    [GitType.GITHUB]: this.handleGithubActions.bind(this)
  };

  /**
   * Executes post-creation actions based on the Git provider type
   * @param component The component being created
   * @throws Error if the Git provider is unsupported
   */
  public async execute(component: Component): Promise<void> {
    const git = component.getGit();
    const gitType = git.getGitType();
    
    const handler = this.gitProviderHandlers[gitType];
    
    if (!handler) {
      throw new Error(`Unsupported Git provider: ${gitType} for Tekton CI`);
    }
    
    await handler(component);
  }

  /**
   * Handles actions for GitHub repositories (currently no actions needed)
   * @param component The component being created
   */
  private async handleGithubActions(component: Component): Promise<void> {
    const componentName = component.getName();
    //TODO: Update the log message to be more descriptive
    console.log(`No post-creation actions needed for component: ${componentName} (GitHub + Tekton CI)`);
  }

  /**
   * Handles actions for Git providers that need webhook configuration (GitLab, Bitbucket)
   * @param component The component being created
   * @throws Error if any action fails
   */
  private async handleGitProviderActions(component: Component): Promise<void> {
    const git = component.getGit();
    const gitProviderType = git.getGitType();
    const componentName = component.getName();
    
    console.log(`Post-creation actions needed for component: ${componentName} (${gitProviderType})`);
    
    try {
      const commands = this.createCommandsForProvider(component);
      await this.executeCommands(commands);
      console.log(`${gitProviderType} post-creation actions completed successfully for ${componentName}`);
    } catch (error) {
      console.error(`Error executing ${gitProviderType} post-creation actions: ${error}`);
      throw new Error(`${gitProviderType} post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Creates commands appropriate for the given Git provider
   * This factory method can be extended to support different command sets for different providers
   * 
   * @param component The component for which commands should be created
   * @returns Array of Command instances suitable for the given provider
   */
  private createCommandsForProvider(component: Component): Command[] {
    // Currently both GitLab and Bitbucket use the same webhook command
    // This can be extended in the future to provide different command sets for different providers
    return this.createWebhookCommands(component);
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
   * Executes an array of commands sequentially
   * @param commands Array of Command instances to execute
   */
  private async executeCommands(commands: Command[]): Promise<void> {
    for (const command of commands) {
      await command.execute();
    }
  }
}

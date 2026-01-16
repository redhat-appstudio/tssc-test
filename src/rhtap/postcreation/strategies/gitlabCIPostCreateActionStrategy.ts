import { Component } from '../../core/component';
import { GitType } from '../../core/integration/git';
import { AddGitlabProjectVariablesCommand } from './commands/addGitlabProjectVariablesCommand';
import { Command } from './commands/command';
import { UpdateCIRunnerImage } from './commands/updateCIRunnerImage';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

/**
 * GitLab-specific implementation of post-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class GitlabCIPostCreateActionStrategy implements ComponentActionStrategy {
  private readonly logger: Logger = LoggerFactory.getLogger('postcreation.strategy.gitlab-ci');
  
  /**
   * Map of Git provider types to their handler functions
   * This allows for easy extension with new Git providers
   */
  private readonly gitProviderHandlers: Partial<
    Record<GitType, (component: Component) => Promise<void>>
  > = {
    [GitType.GITLAB]: this.handleGitLabActions.bind(this),
  };

  /**
   * Creates a new instance of GitlabCIPostCreateActionStrategy
   */
  constructor() {}

  /**
   * Executes GitLabCI-specific post-creation actions
   * The following is the matrix of supported actions:
   * - GitLab:
   *   - Add environment variables/secrets to GitLab
   * - Github:
   *   - Not supported
   * - Bitbucket:
   *   - Not supported
   * @param component The component being created
   * @throws Error if the Git provider is not supported
   */
  public async execute(component: Component): Promise<void> {
    const git = component.getGit();
    const gitType = git.getGitType();

    const handler = this.gitProviderHandlers[gitType];

    if (!handler) {
      throw new Error(`Unsupported Git provider: ${gitType} for GitLab CI`);
    }

    await handler(component);
  }

  /**
   * Handles actions specific to GitLab repositories
   * @param component The component being created
   */
  private async handleGitLabActions(component: Component): Promise<void> {
    const componentName = component.getName();
    this.logger.info('Executing post-creation actions for component: {} (GitLab CI)', componentName);

    try {
      const commands = this.createCommandsForGitLab(component);
      await this.executeCommands(commands);
      this.logger.info('GitLab CI post-creation actions completed successfully for {}', componentName);
    } catch (error) {
      this.logger.error('Error executing GitLab CI post-creation actions: {}', error);
      throw new Error(
        `GitLab CI post-creation actions failed: ${error}`
      );
    }
  }

  /**
   * Creates commands for GitLab integration
   * This factory method can be extended to support different command sets
   *
   * @param component The component for which commands should be created
   * @returns Array of Command instances suitable for GitLab integration
   */
  private createCommandsForGitLab(component: Component): Command[] {
    return [new UpdateCIRunnerImage(component), new AddGitlabProjectVariablesCommand(component)];
  }

  /**
   * Executes a list of commands sequentially
   * @param commands List of commands to execute
   */
  private async executeCommands(commands: Command[]): Promise<void> {
    for (const command of commands) {
      await command.execute();
    }
  }
}

import { Component } from '../../core/component';
import { GitType } from '../../core/integration/git';
import { AddGithubSecretsAndVariablesCommand } from './commands/addGithubSecretsAndVariablesCommand';
import { Command } from './commands/command';
import { UpdateCIRunnerImage } from './commands/updateCIRunnerImage';
import { UncommentCustomRootCA } from './commands/uncommentCustomRootCA';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

export class GithubActionsPostCreateActionStrategy implements ComponentActionStrategy {
  private readonly logger: Logger = LoggerFactory.getLogger('postcreation.strategy.github-actions');
  
  private readonly gitProviderHandlers: Partial<
    Record<GitType, (component: Component) => Promise<void>>
  > = {
    [GitType.GITHUB]: this.handleGithubProviderActions.bind(this),
  };

  public async execute(component: Component): Promise<void> {
    const git = component.getGit();
    const gitType = git.getGitType();

    const handler = this.gitProviderHandlers[gitType];

    if (!handler) {
      throw new Error(`Unsupported Git provider: ${gitType} for GitHub Actions`);
    }

    await handler(component);
  }

  private async handleGithubProviderActions(component: Component): Promise<void> {
    const componentName = component.getName();
    const commands: Command[] = [
      new UpdateCIRunnerImage(component),
      new AddGithubSecretsAndVariablesCommand(component),
      new UncommentCustomRootCA(component),
    ];
    for (const command of commands) {
      await command.execute();
    }
    this.logger.info(
      'No post-creation actions needed for component: {} (GitHub + GitHub Actions)',
      componentName
    );
  }
}

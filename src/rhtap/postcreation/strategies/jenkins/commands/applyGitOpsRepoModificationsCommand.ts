import { Component } from '../../../../core/component';
import { ApplySourceRepoModificationsCommand } from './applySourceRepoModificationsCommand';
import { BaseCommand } from './baseCommand';

/**
 * Command to apply modifications to GitOps repository
 */
export class ApplyGitOpsRepoModificationsCommand extends BaseCommand {
  private sourceRepoCommand: ApplySourceRepoModificationsCommand;

  constructor(component: Component) {
    super(component);
    this.sourceRepoCommand = new ApplySourceRepoModificationsCommand(component);
  }

  public async execute(): Promise<void> {
    this.logStart('GitOps repository modifications');

    const modifications = await this.sourceRepoCommand['getSourceRepoModifications']();
    await this.sourceRepoCommand['commitChanges'](
      this.git.getGitOpsRepoName(),
      modifications,
      'Update GitOps repository'
    );

    this.logComplete('GitOps repository modifications');
  }
}

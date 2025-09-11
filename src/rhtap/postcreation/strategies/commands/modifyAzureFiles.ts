import { Component } from '../../../core/component';
import { ContentModifications, Git } from '../../../core/integration/git';
import { BaseCommand } from './baseCommand';

const COMMIT_MESSAGE = 'Update Azure Pipeline agent pool and variable group';
const AGENT_POOL = 'rhtap-testing';
/**
 * ModifyAzureFiles
 */
export class ModifyAzureFiles extends BaseCommand {
  private readonly gitClient: Git;

  constructor(component: Component) {
    super(component);
    this.gitClient = this.git;
  }

  public async execute(): Promise<void> {
    this.logStart('Modifying Azure pipeline file');

    await Promise.all([
      this.setVars(this.git.getSourceRepoName()),
      this.setVars(this.git.getGitOpsRepoName()),
    ]);
  }

  private async setVars(repoName: string): Promise<void> {
    const modifications: ContentModifications = {
      'azure-pipelines.yml': [
        {
          oldContent: 'name: Default',
          newContent: `name: ${AGENT_POOL}`,
        },
        {
          oldContent: '- group: rhtap',
          newContent: `- group: ${this.component.getName()}`,
        },
      ],
    };
    await this.gitClient.commitChangesToRepo(
      this.git.getRepoOwner(),
      repoName,
      modifications,
      COMMIT_MESSAGE,
      'main'
    );
  }
}

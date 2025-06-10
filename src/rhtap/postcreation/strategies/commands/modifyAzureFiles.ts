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

    await Promise.all([this.setAgentPool()]);
  }

  private async setAgentPool(): any {
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
      this.git.getSourceRepoName(),
      modifications,
      COMMIT_MESSAGE,
      'main'
    );
  }
  setSecretGroup(): any {
    throw new Error('Method not implemented.');
  }
}

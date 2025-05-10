import { BaseCommand } from './baseCommand';

/**
 * Command to create Jenkins folder
 */
export class CreateJenkinsFolderCommand extends BaseCommand {
  public async execute(): Promise<void> {
    this.logStart('Jenkins folder creation');
    await this.jenkinsCI.createFolder(this.folderName);
    this.logComplete('Jenkins folder creation');
  }
}

import { sleep } from '../../../utils/util';
import { Component } from '../../core/component';
import { AddAzureVarsAndSecrets } from './commands/addAzureSecrets';
import { AuthorizeAzurePipelines } from './commands/authorizeAzurePipeline';
import { CreateAzurePipelines } from './commands/createAzurePipelines';
import { ModifyAzureFiles } from './commands/modifyAzureFiles';
import { UpdateCIRunnerImage } from './commands/updateCIRunnerImage';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';

/**
 * Azure-specific implementation of post-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class AzureCIPostCreateActionStrategy implements ComponentActionStrategy {
  constructor() {}

  /**
   * Executes Azure-specific post-creation actions
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    const folderName = component.getName();
    console.log(`Executing Azure post-creation actions for component: ${folderName}`);

    try {
      // Create command instances
      const commands = [
        new AddAzureVarsAndSecrets(component),
        new ModifyAzureFiles(component),
        new CreateAzurePipelines(component),
        new AuthorizeAzurePipelines(component),
        new UpdateCIRunnerImage(component),
      ];

      for (const command of commands) {
        await command.execute();
      }

      // Wait for all changes to be processed
      // await sleep(60000);

      console.log(`Azure post-creation actions completed successfully for ${folderName}`);
    } catch (error) {
      console.error(`Error executing Azure post-creation actions: ${error}`);
      throw new Error(
        `Azure post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

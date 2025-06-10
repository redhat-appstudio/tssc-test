import { Component } from '../../core/component';
import { AddAzureSecrets } from './commands/addAzureSecrets';
import { CreateAzurePipelines } from './commands/createAzurePipelines';
import { ModifyAzureFiles } from './commands/modifyAzureFiles';
import { PostCreateActionStrategy } from './postCreateActionStrategy';

/**
 * Azure-specific implementation of post-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class AzureCIPostCreateActionStrategy implements PostCreateActionStrategy {
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
        new AddAzureSecrets(component),
        new ModifyAzureFiles(component),
        new CreateAzurePipelines(component),
      ];

      for (const command of commands) {
        await command.execute();
      }

      console.log(`Azure post-creation actions completed successfully for ${folderName}`);
    } catch (error) {
      console.error(`Error executing Azure post-creation actions: ${error}`);
      throw new Error(
        `Azure post-creation actions failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

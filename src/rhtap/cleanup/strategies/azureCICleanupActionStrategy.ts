import { Component } from '../../core/component';
import { ComponentActionStrategy } from '../../postcreation/strategies/componentActionStrategy';
import { RemoveServiceConnection } from './commands/removeServiceConnection';
import { RemoveVarsAndSecrets } from './commands/removeVarsAndSecrets';

/**
 * Azure-specific implementation of cleanup-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class AzureCICleanupActionStrategy implements ComponentActionStrategy {
  constructor() {}

  /**
   * Executes Azure-specific cleanup-creation actions
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    const folderName = component.getName();
    console.log(`Executing Azure post-creation actions for component: ${folderName}`);

    try {
      // Create command instances
      const commands = [
        new RemoveVarsAndSecrets(component),
        new RemoveServiceConnection(component),
      ];

      for (const command of commands) {
        await command.execute();
      }

      console.log(`Azure cleanup-creation actions completed successfully for ${folderName}`);
    } catch (error) {
      console.error(`Error executing Azure cleanup-creation actions: ${error}`);
      throw new Error(
        `Azure cleanup-creation actions failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

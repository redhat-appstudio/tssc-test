import { Component } from '../../core/component';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';
import { RemoveServiceConnection } from './commands/removeServiceConnection';
import { RemoveVarsAndSecrets } from './commands/removeVarsAndSecrets';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

/**
 * Azure-specific implementation of cleanup-creation action strategy
 * Uses command pattern to organize and execute different actions
 */
export class AzureCICleanupActionStrategy implements ComponentActionStrategy {
  private readonly logger: Logger = LoggerFactory.getLogger('rhtap.cleanup.strategy.azure-ci');
  
  constructor() {}

  /**
   * Executes Azure-specific cleanup-creation actions
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    const folderName = component.getName();
    this.logger.info('Executing Azure post-creation actions for component: {}', folderName);

    try {
      // Create command instances
      const commands = [
        new RemoveVarsAndSecrets(component),
        new RemoveServiceConnection(component),
      ];

      for (const command of commands) {
        await command.execute();
      }

      this.logger.info('Azure cleanup-creation actions completed successfully for {}', folderName);
    } catch (error) {
      this.logger.error('Error executing Azure cleanup-creation actions: {}', error);
      throw new Error(
        `Azure cleanup-creation actions failed: ${error}`
      );
    }
  }
}

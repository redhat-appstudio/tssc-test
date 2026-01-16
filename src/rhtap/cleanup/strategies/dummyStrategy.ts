import { Component } from '../../core/component';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

/**
 * Dummy strategy to serve as placeholder for not yet implemented action strategies
 */
export class DummyCleanupActionStrategy implements ComponentActionStrategy {
  private readonly logger: Logger = LoggerFactory.getLogger('rhtap.cleanup.strategy.dummy');
  
  constructor() {}

  /**
   * Executes dummy cleanup action strategy
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    this.logger.info('No action strategy is implemented for component: {}', component.getName());
  }
}

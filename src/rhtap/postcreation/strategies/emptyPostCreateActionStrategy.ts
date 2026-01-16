import { Component } from '../../core/component';
import { ComponentActionStrategy } from '../../common/strategies/componentActionStrategy';
import { LoggerFactory } from '../../../logger/factory/loggerFactory';
import { Logger } from '../../../logger/logger';

/**
 * A "null object" implementation of PostCreateActionStrategy
 * Used for CI types that don't require any post-creation actions (like Tekton)
 */
export class EmptyPostCreateActionStrategy implements ComponentActionStrategy {
  private readonly logger: Logger = LoggerFactory.getLogger('postcreation.strategy.empty');
  
  /**
   * No-op implementation - doesn't perform any post-creation actions
   * @param component The component to process
   */
  public async execute(component: Component): Promise<void> {
    this.logger.info('No post-creation actions needed for component: {}', component.getName());
    // Intentionally empty implementation - no actions required
  }
}

import { Component } from '../core/component';
import { PostCreateActionStrategyFactory } from './strategies/postCreateActionStrategyFactory';
import { LoggerFactory } from '../../logger/factory/loggerFactory';
import { Logger } from '../../logger/logger';

/**
 * Handles post-creation actions for components based on CI and Git provider combinations
 * Acts as a facade to coordinate the appropriate strategy execution
 */
export class ComponentPostCreateAction {
  private readonly logger: Logger;
  private component: Component;

  constructor(component: Component) {
    this.logger = LoggerFactory.getLogger('postcreation.facade');
    this.component = component;
  }

  /**
   * Executes appropriate post-creation actions based on the component's CI and Git provider
   */
  public async execute(): Promise<void> {
    const ci = this.component.getCI();
    const ciType = ci.getCIType();

    this.logger.info('Executing post-creation actions for CI: {}', ciType);

    try {
      // Use the factory to get the appropriate strategy for the CI type
      const strategy = PostCreateActionStrategyFactory.createStrategy(ciType);

      // Execute the strategy with the component
      await strategy.execute(this.component);

      this.logger.info('Post-creation actions completed successfully for {}', this.component.getName());
    } catch (error) {
      this.logger.error(
        'Error executing post-creation actions: {}',
        error
      );
      throw new Error(
        `Post-creation actions failed: ${error}`
      );
    }
  }
}

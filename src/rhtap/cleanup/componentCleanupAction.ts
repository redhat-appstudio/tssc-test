import { Component } from '../core/component';
import { CleanupActionStrategyFactory } from './strategies/cleanupActionStrategyFactory';
import { LoggerFactory, Logger } from '../../logger/logger';

/**
 * Handles cleanup actions for components based on CI and Git provider combinations
 * Acts as a facade to coordinate the appropriate strategy execution
 */
export class ComponentCleanupAction {
  private readonly logger: Logger;
  private component: Component;

  constructor(component: Component) {
    this.logger = LoggerFactory.getLogger('rhtap.cleanup.facade');
    this.component = component;
  }

  /**
   * Executes appropriate cleanup-creation actions based on the component's CI and Git provider
   */
  public async execute(): Promise<void> {
    const ci = this.component.getCI();
    const ciType = ci.getCIType();

    this.logger.info(`Executing cleanup actions for CI: ${ciType}`);

    try {
      // Use the factory to get the appropriate strategy for the CI type
      const strategy = CleanupActionStrategyFactory.createStrategy(ciType);

      // Execute the strategy with the component
      await strategy.execute(this.component);

      this.logger.info(`Cleanup-creation actions completed successfully for ${this.component.getName()}`);
    } catch (error) {
      this.logger.error(`Error executing cleanup-creation actions: ${error}`);
      throw new Error(
        `Cleanup-creation actions failed: ${error}`
      );
    }
  }
}

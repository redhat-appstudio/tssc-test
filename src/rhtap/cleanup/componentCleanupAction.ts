import { Component } from '../core/component';
import { CleanupActionStrategyFactory } from './strategies/cleanupActionStrategyFactory';

/**
 * Handles cleanup actions for components based on CI and Git provider combinations
 * Acts as a facade to coordinate the appropriate strategy execution
 */
export class ComponentCleanupAction {
  private component: Component;

  constructor(component: Component) {
    this.component = component;
  }

  /**
   * Executes appropriate cleanup-creation actions based on the component's CI and Git provider
   */
  public async execute(): Promise<void> {
    const ci = this.component.getCI();
    const ciType = ci.getCIType();

    console.log(`Executing cleanup actions for CI: ${ciType}`);

    try {
      // Use the factory to get the appropriate strategy for the CI type
      const strategy = CleanupActionStrategyFactory.createStrategy(ciType);

      // Execute the strategy with the component
      await strategy.execute(this.component);

      console.log(
        `Cleanup-creation actions completed successfully for ${this.component.getName()}`
      );
    } catch (error) {
      console.error(
        `Error executing cleanup-creation actions: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new Error(
        `Cleanup-creation actions failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

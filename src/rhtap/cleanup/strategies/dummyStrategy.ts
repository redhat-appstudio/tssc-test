import { Component } from '../../core/component';
import { ComponentActionStrategy } from '../../postcreation/strategies/componentActionStrategy';

/**
 * Dummy strategy to serve as placeholder for not yet implemented action strategies
 */
export class DummyCleanupActionStrategy implements ComponentActionStrategy {
  constructor() {}

  /**
   * Executes dummy cleanup action strategy
   * @param component The component being created
   */
  public async execute(component: Component): Promise<void> {
    console.log(`No action strategy is implemented for component: ${component.getName()}`);
  }
}

import { Component } from '../../core/component';

/**
 * Interface for component action strategies
 * This strategy pattern allows for different CI implementations to handle
 * their specific component requirements
 */
export interface ComponentActionStrategy {
  /**
   * Executes component actions for a specific CI implementation
   * @param component The component being created
   */
  execute(component: Component): Promise<void>;
}

import { Component } from '../../core/component';

/**
 * Interface for post-creation action strategies
 * This strategy pattern allows for different CI implementations to handle
 * their specific post-creation requirements
 */
export interface PostCreateActionStrategy {
  /**
   * Executes post-creation actions for a specific CI implementation
   * @param component The component being created
   */
  execute(component: Component): Promise<void>;
}

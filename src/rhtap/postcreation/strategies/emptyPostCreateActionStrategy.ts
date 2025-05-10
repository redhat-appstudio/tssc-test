import { Component } from '../../core/component';
import { PostCreateActionStrategy } from './postCreateActionStrategy';

/**
 * A "null object" implementation of PostCreateActionStrategy
 * Used for CI types that don't require any post-creation actions (like Tekton)
 */
export class EmptyPostCreateActionStrategy implements PostCreateActionStrategy {
  /**
   * No-op implementation - doesn't perform any post-creation actions
   * @param component The component to process
   */
  public async execute(component: Component): Promise<void> {
    console.log(`No post-creation actions needed for component: ${component.getName()}`);
    // Intentionally empty implementation - no actions required
  }
}

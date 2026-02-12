/**
 * Global context manager for storing test context
 * Provides fallback when AsyncLocalStorage doesn't propagate
 */

import { TestContext } from './types';

/**
 * Global context storage (fallback for when AsyncLocalStorage fails)
 */
class ContextManager {
  private static instance: ContextManager;
  private currentContext: TestContext | undefined;

  private constructor() {}

  public static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  public setContext(context: TestContext | undefined): void {
    this.currentContext = context;
  }

  public getContext(): TestContext | undefined {
    return this.currentContext;
  }

  public clearContext(): void {
    this.currentContext = undefined;
  }
}

export const contextManager = ContextManager.getInstance();

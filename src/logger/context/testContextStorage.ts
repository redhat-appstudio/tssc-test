/**
 * Automatic test context system using AsyncLocalStorage
 * Auto-injects: projectName (timestamp added by Winston formatter)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { TestInfo } from '@playwright/test';
import { contextManager } from './contextManager';
import { TestContext } from './types';

/**
 * AsyncLocalStorage for automatic context propagation
 * Maintains test context throughout async call chains
 */
export const testContextStorage = new AsyncLocalStorage<TestContext>();

/**
 * Extract simplified test context from Playwright TestInfo
 * Extracts projectName and worker ID
 */
export function extractTestContext(testInfo: TestInfo): TestContext {
  return {
    projectName: testInfo.project.name,
    worker: testInfo.parallelIndex,
  };
}

/**
 * Get current test context (if running within a test)
 * Returns undefined if not in test execution context
 *
 * Uses AsyncLocalStorage first, falls back to global context manager
 */
export function getCurrentTestContext(): TestContext | undefined {
  // Try AsyncLocalStorage first
  const alsContext = testContextStorage.getStore();
  if (alsContext) {
    return alsContext;
  }

  // Fallback to global context manager (for when AsyncLocalStorage doesn't propagate)
  return contextManager.getContext();
}

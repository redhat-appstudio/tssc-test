/**
 * Automatic test context system using AsyncLocalStorage
 * Auto-injects: projectName (timestamp added by Winston formatter)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { TestInfo } from '@playwright/test';

/**
 * Auto-injected test context - projectName and worker ID
 * - projectName: From testInfo.project.name (e.g., 'e2e-go[github-tekton-quay-remote]')
 * - worker: Worker/parallel index (e.g., 0, 1, 2...)
 * Note: timestamp is added automatically by Winston formatter
 */
export interface TestContext {
  projectName?: string;    // e.g., 'e2e-go[github-tekton-quay-remote]'
  worker?: number;         // e.g., 0, 1, 2
}

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
  try {
    const { contextManager } = require('./contextManager');
    return contextManager.getContext();
  } catch {
    return undefined;
  }
}

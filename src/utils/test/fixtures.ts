import { TestItem } from '../../playwright/testItem';
import { test as base, TestInfo } from '@playwright/test';
import { testContextStorage, extractTestContext } from '../../logger/context/testContextStorage';
import { LoggerFactory } from '../../logger/logger';
import type { Logger } from '../../logger/logger';

/**
 * Type definition for the TSSC test fixtures
 */
export type RhtapTestFixture = {
  testItem: TestItem;
  autoTestContext: void; // Auto-fixture for logger context
  logger: Logger; // Logger with test context pre-configured (supports parameterized logging)
};

/**
 * Extracts the TestItem from the test configuration
 * @param testInfo Playwright test info object
 * @returns The TestItem from the test configuration or throws an error if not found
 */
export function getDynamicTestItem(testInfo: any): TestItem {
  const testItemFromConfig = testInfo?.project?.use?.testItem as TestItem;
  if (!testItemFromConfig) {
    throw new Error(
      'No testItem found in test configuration. Check your playwright.config.ts setup.'
    );
  }
  return testItemFromConfig;
}

/**
 * Creates a basic TSSC test fixture with the TestItem and auto-logger context
 */
export const createBasicFixture = () => {
  return base.extend<RhtapTestFixture>({
    testItem: async ({}, use, testInfo) => {
      const testItem = getDynamicTestItem(testInfo);
      await use(testItem);
    },
    // Logger fixture with test context pre-configured
    logger: async ({}, use, testInfo: TestInfo) => {
      const testContext = extractTestContext(testInfo);
      // Extract test file name without extension (e.g., "full_workflow" from "full_workflow.test.ts")
      const testFileName = testInfo.file.split('/').pop()?.replace(/\.test\.ts$/, '') || 'test';
      
      // Use just the test file name as logger name
      // Project info is already available in metadata (projectName, worker)
      const loggerName = testFileName;
      
      const logger = LoggerFactory.getLogger(loggerName, testContext);
      await use(logger);
    },
    // Auto-fixture for logger context (runs automatically before every test)
    autoTestContext: [
      async ({}, use, testInfo: TestInfo) => {
        const testContext = extractTestContext(testInfo);

        // Set global context as fallback for AsyncLocalStorage
        // This ensures context propagates across all async boundaries
        const { contextManager } = require('../../logger/context/contextManager');
        contextManager.setContext(testContext);

        try {
          // Run test within AsyncLocalStorage context
          // All logger calls within this test will automatically include test context
          await testContextStorage.run(testContext, async () => {
            await use();
          });
        } finally {
          // Clean up global context after test
          contextManager.clearContext();
        }
      },
      { auto: true }, // Automatically runs for every test
    ],
  });
};

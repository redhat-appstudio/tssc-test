import { test as base } from '@playwright/test';
import { TestItem } from '../../playwright/testItem';

/**
 * Type definition for the RHTAP test fixtures
 */
export type RhtapTestFixture = {
  testItem: TestItem;
};

/**
 * Extracts the TestItem from the test configuration
 * @param testInfo Playwright test info object
 * @returns The TestItem from the test configuration or throws an error if not found
 */
export function getDynamicTestItem(testInfo: any): TestItem {
  const testItemFromConfig = testInfo?.project?.use?.testItem as TestItem;
  if (!testItemFromConfig) {
    throw new Error('No testItem found in test configuration. Check your playwright.config.ts setup.');
  }
  return testItemFromConfig;
}
    
/**
 * Creates a basic RHTAP test fixture with the TestItem
 */
export const createBasicFixture = () => {
  return base.extend<RhtapTestFixture>({
    testItem: async ({}, use, testInfo) => {
      const testItem = getDynamicTestItem(testInfo);
      await use(testItem);
    }
  });
};
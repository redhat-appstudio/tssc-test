import { defineConfig, PlaywrightTestConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

import { TestItem } from './src/playwright/testItem';
import { TestPlan } from './src/playwright/testplan';

// Extend Playwright types to include testItem
declare module '@playwright/test' {
  interface PlaywrightTestOptions {
    testItem?: TestItem;
  }
}

// Configuration constants
const DEFAULT_TIMEOUT = 2100000; // 35 minutes
const DEFAULT_WORKERS = 6;
const DEFAULT_TESTPLAN_PATH = path.resolve(process.cwd(), 'testplan.json');

/**
 * Load test plan configuration
 */
function loadTestPlan(): TestPlan {
  const testPlanPath = process.env.TESTPLAN_PATH || DEFAULT_TESTPLAN_PATH;
  
  if (!existsSync(testPlanPath)) {
    console.warn(`Test plan not found at ${testPlanPath}, using default configuration`);
    return new TestPlan({ templates: [], tssc: [], tests: [] });
  }
  
  try {
    const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
    return new TestPlan(testPlanData);
  } catch (error) {
    console.error(`Failed to parse test plan: ${error}`);
    throw error;
  }
}

/**
 * Load exported test items for UI tests
 */
function loadUIProjects(): Array<{ name: string; testMatch: string; use: { testItem: TestItem } }> {
  const exportedTestItemsPath = './tmp/test-items.json';
  
  if (!existsSync(exportedTestItemsPath)) {
    return [];
  }
  
  try {
    const exportedData = JSON.parse(readFileSync(exportedTestItemsPath, 'utf-8'));
    
    if (!exportedData.testItems || !Array.isArray(exportedData.testItems)) {
      return [];
    }
    
    return exportedData.testItems.map((itemData: any) => ({
      name: `ui-${(itemData as { name: string }).name}`,
      testMatch: '**/ui.test.ts',
      use: {
        testItem: TestItem.fromJSON(itemData),
      },
    }));
  } catch (error) {
    console.warn('Could not load exported test items for UI tests:', error);
    return [];
  }
}

// Load configurations
const testPlan = loadTestPlan();
const e2eProjects = testPlan.getProjectConfigs().map(config => ({
  name: config.name,
  use: {
    testItem: config.testItem,
  },
}));

const uiProjects = loadUIProjects();
const allProjects = [...e2eProjects, ...uiProjects];

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: DEFAULT_WORKERS,
  timeout: DEFAULT_TIMEOUT,
  
  // Use specific projects or fallback to default
  projects: allProjects.length ? allProjects : [{ name: 'default' }],
  
  // Reporter configuration
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  
  // Global setup and teardown
  globalSetup: './global-setup.ts',
});

import { defineConfig, PlaywrightTestConfig, PlaywrightTestOptions, PlaywrightWorkerOptions } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { TestPlan } from './src/playwright/testplan';
import { TestItem } from './src/playwright/testItem';

// Extend Playwright types to include testItem
declare module '@playwright/test' {
  interface PlaywrightTestOptions {
    testItem?: TestItem;
  }
}

// Load the test plan for e2e tests
const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
const testPlan = new TestPlan(testPlanData);

// Create projects using the TestPlan class
const e2eProjects = testPlan.getProjectConfigs().map(config => ({
  name: config.name,
  use: {
    testItem: config.testItem,
  },
}));

// Authentication file path
const authFile = path.join(__dirname, 'playwright/.auth/user.json');

// Create UI projects for UI tests from exported test items
let uiProjects: any[] = [];
const exportedTestItemsPath = './tmp/test-items.json';
if (existsSync(exportedTestItemsPath)) {
  try {
    const exportedData = JSON.parse(readFileSync(exportedTestItemsPath, 'utf-8'));
    if (exportedData.testItems && Array.isArray(exportedData.testItems)) {
      uiProjects = exportedData.testItems.map((itemData: any) => ({
        name: `ui-${itemData.name}`,
        testMatch: '**/ui.test.ts',
        use: {
          testItem: TestItem.fromJSON(itemData),
          // State file for authentication
          storageState: authFile,
        },
        // UI tests depend on auth-setup project
        dependencies: ['auth-setup'],
      }));
    }
  } catch (error) {
    console.warn('Could not load exported test items for UI tests:', error);
  }
}

const authSetupProject = {
  name: 'auth-setup',
  testMatch: '**/auth.setup.ts',
};

const allProjects = [authSetupProject, ...e2eProjects, ...uiProjects];

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: 6,
  projects: allProjects.length ? allProjects : [{ name: 'default' }],
  reporter: [['html'], ['list']],
  timeout: 900000, // Default to 15 minutes (900000ms)
  globalSetup: './global-setup.ts',
});

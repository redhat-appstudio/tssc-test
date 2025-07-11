import { defineConfig, PlaywrightTestConfig, PlaywrightTestOptions, PlaywrightWorkerOptions } from '@playwright/test';
import { TestItem } from './src/playwright/testItem';
import { loadProjectConfigurations, ProjectConfig } from './src/utils/projectConfigSingleton';

// Extend Playwright types to include testItem
declare module '@playwright/test' {
  interface PlaywrightTestOptions {
    testItem?: TestItem;
  }
}

// Configuration constants
const DEFAULT_TIMEOUT = 2100000; // 35 minutes

// Environment variable flags to control which tests run
const ENABLE_E2E_TESTS = process.env.ENABLE_E2E_TESTS !== 'false'; // Default: true
const ENABLE_UI_TESTS = process.env.ENABLE_UI_TESTS === 'true';    // Default: false

let projectConfigs: ProjectConfig[] = [];
let allProjects: any[] = [];

try {
  // Load pre-generated configurations
  projectConfigs = loadProjectConfigurations();

  let e2eProjects: any[] = [];
  let uiProjects: any[] = [];

  // Create e2e projects if enabled
  if (ENABLE_E2E_TESTS) {
    e2eProjects = projectConfigs.map(config => ({
      name: `e2e-${config.name}`,
      testMatch: '**/*.test.e2e.ts',
      use: {
        testItem: config.testItem,
      },
    }));
  }

  // Create UI projects if enabled
  if (ENABLE_UI_TESTS) {
    uiProjects = projectConfigs.map(config => ({
      name: `ui-${config.name}`,
      testMatch: '**/*.ui.test.ts',
      use: {
        testItem: config.testItem,
      },
      // Only add dependencies if e2e tests are enabled
      ...(ENABLE_E2E_TESTS && {
        dependencies: [`e2e-${config.name}`]
      })
    }));
  }

  allProjects = [...e2eProjects, ...uiProjects];

} catch (error) {
  // Silent fallback - provide empty projects to prevent complete failure
  allProjects = [];
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: 6,
  timeout: DEFAULT_TIMEOUT,
  fullyParallel: true, // This should allow immediate execution when dependencies are met
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

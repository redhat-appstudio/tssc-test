import { defineConfig} from '@playwright/test';
import { TestItem } from './src/playwright/testItem';
import { loadProjectConfigurations, ProjectConfig } from './src/utils/projectConfigLoader';
import path from 'path';

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
const DEFAULT_WORKERS = 6;
const DEFAULT_UI_TIMEOUT = 30000;

let projectConfigs: ProjectConfig[] = [];
let allProjects: any[] = [];

try {
  // Load pre-generated configurations
  projectConfigs = loadProjectConfigurations();

  // Authentication file path
  const authFile = path.join('./playwright/.auth/user.json');

  let e2eProjects: any[] = [];
  let uiProjects: any[] = [];
  let authProjects: any[] = [];

  // Create e2e projects if enabled
  if (ENABLE_E2E_TESTS) {
    e2eProjects = projectConfigs.map(config => ({
      name: `e2e-${config.name}`,
      testMatch: 'tests/tssc/**/*.test.ts',
      use: {
        testItem: config.testItem,
      },
    }));
  }

  // Create UI projects if enabled
  if (ENABLE_UI_TESTS) {
    // Create auth setup project for UI tests
    authProjects = [{ name: 'auth-setup', testMatch: '**/auth.setup.ts' }];

    uiProjects = projectConfigs.map(config => ({
      name: `ui-${config.name}`,
      testMatch: 'tests/ui/**/*.test.ts',
      use: {
        testItem: config.testItem,
        storageState: authFile,
      },
      dependencies: [
        // Always depend on auth-setup
        'auth-setup',
        ...(ENABLE_E2E_TESTS
          // Set dependency behavior based on flag:
          // By default, UI test depends only on its corresponding e2e test.
          // If UI_DEPENDS_ON_ALL_E2E is set to 'true', depend on all e2e tests.
          ? (process.env.UI_DEPENDS_ON_ALL_E2E === 'true'
            ? projectConfigs.map(cfg => `e2e-${cfg.name}`)
            : [`e2e-${config.name}`]
            )
          : []
        )
      ]
    }));
  }

  allProjects = [
    ...authProjects,
    ...e2eProjects,
    ...uiProjects
  ];

} catch (error) {
  // Silent fallback - provide empty projects to prevent complete failure
  allProjects = [];
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: DEFAULT_WORKERS,
  timeout: DEFAULT_TIMEOUT,
  fullyParallel: false, // This should allow immediate execution when dependencies are met
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

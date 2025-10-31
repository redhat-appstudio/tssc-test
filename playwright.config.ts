import { defineConfig} from '@playwright/test';
import { TestItem } from './src/playwright/testItem';
import { loadProjectConfigurations, ProjectConfig } from './src/utils/projectConfigLoader';
import { getTestMatchPattern } from './src/utils/testFilterLoader';
import { TestPlan } from './src/playwright/testplan';
import path from 'path';

// Extend Playwright types to include testItem
declare module '@playwright/test' {
  interface PlaywrightTestOptions {
    testItem?: TestItem;
  }
}

// Configuration constants
const DEFAULT_TIMEOUT = 2100000; // 35 minutes

const DEFAULT_WORKERS = 6;
const DEFAULT_UI_TIMEOUT = 60000;

let projectConfigs: ProjectConfig[] = [];
let allProjects: any[] = [];

try {
  // Load pre-generated configurations
  projectConfigs = loadProjectConfigurations();

  // Authentication file path
  const authFile = path.join('./playwright/.auth/user.json');

  // Detect if UI tests are needed based on test plan content
  let hasUITests = false;
  const requestedPlan = process.env.TESTPLAN_NAME;
  
  // Special handling for ui-tests plan
  if (requestedPlan === 'ui-tests') {
    hasUITests = true;
    console.log('Running UI tests with existing project configuration');
  } else {
    const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
    console.log(`Checking for UI tests in test plan: ${testPlanPath}`);
    
    // Check if test plan file exists first
    if (!require('fs').existsSync(testPlanPath)) {
      console.warn(`Test plan file not found at ${testPlanPath}, defaulting to E2E tests`);
    } else {
      try {
        const testPlanData = JSON.parse(require('fs').readFileSync(testPlanPath, 'utf-8'));
        const testPlan = new TestPlan(testPlanData);
        
        // Check if any test plan contains UI-related tests
        // Uses naming convention: tests containing 'ui', 'component', or 'page' substrings are considered UI tests
        const allTests = testPlan.getTests();
        hasUITests = allTests.some(test => 
          test.toLowerCase().includes('ui') || 
          test.toLowerCase().includes('component') ||
          test.toLowerCase().includes('page')
        );
        console.log(`UI test detection completed for ${testPlanPath}: ${hasUITests ? 'UI tests found' : 'No UI tests detected'}`);
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.error(`Failed to parse JSON from test plan file ${testPlanPath}:`, error.message);
          if (error instanceof Error) {
            console.error('JSON parse error stack:', error.stack);
          } else {
            console.error('JSON parse error stack: <unknown error type>');
          }
        } else if (error instanceof Error) {
          console.error(`IO error reading test plan file ${testPlanPath}:`, error.message);
          console.error('IO error stack:', error.stack);
        } else {
          console.error(`IO error reading test plan file ${testPlanPath}: <unknown error>`);
          console.error('IO error stack: <unknown error type>');
        }
        console.warn('Defaulting to E2E tests due to test plan parsing error');
      }
    }
  }

  // Determine if UI tests should run based on test plan content
  const shouldRunUITests = hasUITests;

  let e2eProjects: any[] = [];
  let uiProjects: any[] = [];
  let importProjects: any[] = [];
  let authProjects: any[] = [];

  // Create E2E projects (always created for backend tests)
  let testMatchPattern: string;
  let patterns: string[];
  
  // Special handling for ui-tests plan - use UI-specific patterns
  if (requestedPlan === 'ui-tests') {
    patterns = ['**/*.ui.test.ts', '**/*.ui.test.tsx', '**/ui/**/*.test.ts', '**/ui/**/*.test.tsx'];
    console.log('Using UI-specific test patterns for ui-tests plan');
  } else {
    testMatchPattern = getTestMatchPattern();
    
    // Parse test match pattern - handle both string and array formats
    if (Array.isArray(testMatchPattern)) {
      patterns = testMatchPattern;
    } else if (typeof testMatchPattern === 'string') {
      // Handle curly brace format like "{pattern1,pattern2}"
      if (testMatchPattern.startsWith('{') && testMatchPattern.endsWith('}')) {
        const content = testMatchPattern.slice(1, -1);
        patterns = content.split(',').map(p => p.trim());
      } else {
        patterns = [testMatchPattern];
      }
    } else {
      patterns = ['**/*.test.ts'];
    }
  }
  
  // Filter tests to separate E2E and UI tests
  // Use case-insensitive filtering to match UI detection logic
  let e2eTests = patterns.filter(pattern => {
    const lowerPattern = pattern.toLowerCase();
    return !lowerPattern.includes('ui') && !lowerPattern.includes('component') && !lowerPattern.includes('page');
  });
  let uiTests = patterns.filter(pattern => {
    const lowerPattern = pattern.toLowerCase();
    return lowerPattern.includes('ui') || lowerPattern.includes('component') || lowerPattern.includes('page');
  });

  // If shouldRunUITests is true but no UI patterns were detected, add default UI patterns
  if (shouldRunUITests && uiTests.length === 0) {
    uiTests = ['**/*.ui.test.ts', '**/*.ui.test.tsx', '**/ui/**/*.test.ts', '**/ui/**/*.test.tsx'];
  }

  // Create projects based on test types
  if (e2eTests.length > 0 && uiTests.length === 0) {
    // Only E2E tests - create E2E projects
    e2eProjects = projectConfigs.map(config => ({
      name: `e2e-${config.name}`,
      testMatch: e2eTests,
      use: {
        testItem: config.testItem,
      },
    }));
  } else if (e2eTests.length === 0 && uiTests.length > 0) {
    // Only UI tests - create UI projects with auth setup
    authProjects = [{ name: 'auth-setup', testMatch: '**/auth.setup.ts' }];
    uiProjects = projectConfigs.map(config => ({
      name: `ui-${config.name}`,
      testMatch: uiTests,
      use: {
        testItem: config.testItem,
        storageState: authFile,
      },
      expect: {
        timeout: DEFAULT_UI_TIMEOUT,
      },
      dependencies: ['auth-setup']
    }));
  } else if (e2eTests.length > 0 && uiTests.length > 0) {
    // Mixed tests - create both E2E and UI projects
    e2eProjects = projectConfigs.map(config => ({
      name: `e2e-${config.name}`,
      testMatch: e2eTests,
      use: {
        testItem: config.testItem,
      },
    }));
    
    authProjects = [{ name: 'auth-setup', testMatch: '**/auth.setup.ts' }];
    uiProjects = projectConfigs.map(config => ({
      name: `ui-${config.name}`,
      testMatch: uiTests,
      use: {
        testItem: config.testItem,
        storageState: authFile,
      },
      expect: {
        timeout: DEFAULT_UI_TIMEOUT,
      },
      dependencies: [
        'auth-setup',
        ...(process.env.UI_DEPENDS_ON_ALL_E2E === 'true'
          ? projectConfigs.map(cfg => `e2e-${cfg.name}`)
          : [`e2e-${config.name}`]
        )
      ]
    }));
  }

  allProjects = [
    ...authProjects,
    ...e2eProjects,
    ...uiProjects,
    ...importProjects
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

  use: {
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'off',
  },
});

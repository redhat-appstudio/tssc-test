import { TestItem } from './src/playwright/testItem';
import { CIType } from './src/rhtap/core/integration/ci';
import { GitType } from './src/rhtap/core/integration/git';
import { TemplateType } from './src/rhtap/core/integration/git/templates/templateFactory';
import { ImageRegistryType } from './src/rhtap/core/integration/registry';
import { randomString } from './src/utils/util';
import { defineConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Load the test plan for e2e tests
const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
const templates = testPlanData.templates || [];
const tssc = testPlanData.tssc || {};

// Create e2e projects from testplan.json
const e2eProjects = templates.map(template => ({
  name: `template-${template}`,
  testMatch: '**/full_workflow.test.ts',
  use: {
    testItem: new TestItem(
      `${template}-${randomString()}`,
      template as TemplateType,
      tssc.registry as ImageRegistryType,
      tssc.git as GitType,
      tssc.ci as CIType,
      tssc.tpa || '',
      tssc.acs || ''
    ),
  },
}));

// Create ui projects for UI tests from exported test items
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
        },
      }));
    }
  } catch (error) {
    console.warn('Could not load exported test items for UI tests:', error);
  }
}

const allProjects = [...e2eProjects, ...uiProjects];

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: 3,
  projects: allProjects.length ? allProjects : [{ name: 'default' }],
  reporter: [['html'], ['list']],
  timeout: 900000, // Default to 15 minutes (900000ms)
  globalSetup: './global-setup.ts',
});

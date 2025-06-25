import { defineConfig, PlaywrightTestConfig, PlaywrightTestOptions, PlaywrightWorkerOptions } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { TestItem } from './src/playwright/testItem';
import { TemplateType } from './src/rhtap/core/integration/git/templates/templateFactory';
import { ImageRegistryType } from './src/rhtap/core/integration/registry';
import { GitType } from './src/rhtap/core/integration/git';
import { CIType } from './src/rhtap/core/integration/ci';
import { randomString } from './src/utils/util';

// Load the test plan
const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
const templates = testPlanData.templates || [];
const tssc = testPlanData.tssc || {};

// Create a project for each template
const projects = templates.map(template => ({
  name: `template-${template}`,
  use: {
    testItem: new TestItem(
      `${template}-${randomString()}`,
      template as TemplateType,
      tssc.registry as ImageRegistryType,
      tssc.git as GitType,
      tssc.ci as CIType,
      tssc.tpa || '',
      tssc.acs || ''
    )
  },
}));

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: 3,
  projects: projects.length ? projects : [{ name: 'default' }],
  reporter: [['html'], ['list']],
  timeout: 900000, // Default to 15 minutes (900000ms)
  globalSetup: './global-setup.ts',
});
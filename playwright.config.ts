import { defineConfig, PlaywrightTestConfig, PlaywrightTestOptions, PlaywrightWorkerOptions } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { TestItem } from './src/playwright/testItem';
import { TemplateType } from './src/rhtap/git/templates/templateFactory';
import { ImageRegistryType } from './src/rhtap/registry';
import { GitType } from './src/rhtap/git';
import { CIType } from './src/rhtap/ci';

// Load the test plan
const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
const templates = testPlanData.templates || [];
const rhtap = testPlanData.rhtap || {};

// Create a project for each template
const projects = templates.map(template => ({
  name: `template-${template}`,
  use: {
    testItem: new TestItem(
      template as TemplateType,
      rhtap.registry as ImageRegistryType,
      rhtap.git as GitType,
      rhtap.ci as CIType,
      rhtap.tpa || '',
      rhtap.acs || ''
    )
  },
}));

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  workers: 3,
  projects: projects.length ? projects : [{ name: 'default' }],
  reporter: [['html'], ['list']],
  timeout: 600000,
});
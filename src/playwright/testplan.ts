import { CIType } from '../../src/rhtap/core/integration/ci';
import { GitType } from '../../src/rhtap/core/integration/git';
import { TemplateType } from '../../src/rhtap/core/integration/git';
import { ImageRegistryType } from '../../src/rhtap/core/integration/registry';
import { randomString } from '../utils/util';
import { TestItem } from './testItem';

export interface TSScConfig {
  git: GitType;
  ci: CIType;
  registry: ImageRegistryType;
  tpa: string;
  acs: string;
  name?: string; // Optional name for deterministic TestItem naming
}

export class TestPlan {
  templates: string[];
  tsscConfigs: TSScConfig[];
  tests: string[];
  testItems: TestItem[]; // Regular field populated in constructor

  constructor(data: any) {
    this.templates = data.templates || [];
    this.tsscConfigs = (data.tssc || []).map((config: any) => ({
      git: config.git || '',
      ci: config.ci || '',
      registry: config.registry || '',
      tpa: config.tpa || '',
      acs: config.acs || '',
      name: config.name, // Optional name from data
    }));
    this.tests = data.tests || [];

    // Generate TestItems once in constructor
    this.testItems = [];
    this.templates.forEach(template => {
      this.tsscConfigs.forEach(tsscConfig => {
        // Use provided name or generate random one
        const itemName = tsscConfig.name || `${template}-${randomString()}`;
        
        this.testItems.push(
          new TestItem(
            itemName,
            template as TemplateType,
            tsscConfig.registry,
            tsscConfig.git,
            tsscConfig.ci,
            tsscConfig.tpa,
            tsscConfig.acs
          )
        );
      });
    });
  }

  hasTemplate(name: string): boolean {
    return this.templates.includes(name);
  }

  hasTest(name: string): boolean {
    return this.tests.includes(name);
  }

  getTestItems(): TestItem[] {
    // Simply return the TestItems created in constructor
    return this.testItems;
  }

  getProjectConfigs(): Array<{
    name: string;
    testItem: TestItem;
  }> {
    return this.testItems.map(testItem => ({
      name: `${testItem.getTemplate()}[${testItem.getGitType()}-${testItem.getCIType()}-${testItem.getRegistryType()}]`,
      testItem
    }));
  }

  // Helper methods for validation
  isValid(): boolean {
    return this.templates.length > 0 && this.tsscConfigs.length > 0;
  }

  getTotalProjectCount(): number {
    return this.templates.length * this.tsscConfigs.length;
  }

  getTemplateNames(): string[] {
    return [...this.templates];
  }

  getTsscConfigNames(): string[] {
    return this.tsscConfigs.map(config => `${config.git}-${config.ci}`);
  }

  // Test filtering methods
  getTests(): string[] {
    return this.tests;
  }

  /**
   * Get test match patterns based on the tests array
   * Supports both folder patterns and specific test files
   */
  getTestMatchPatterns(): string[] {
    if (this.tests.length === 0) {
      // If no tests specified, return default pattern
      return ['**/*.test.ts'];
    }

    return this.tests.map(test => {
      // If test ends with .test.ts, treat as specific file
      if (test.endsWith('.test.ts')) {
        return `tests/**/${test}`;
      }
      // Otherwise, treat as folder name
      else {
        return `tests/${test}/**/*.test.ts`;
      }
    });
  }

  /**
   * Get a single test match pattern (Playwright expects a single pattern)
   * Combines multiple patterns using Playwright's pattern syntax
   */
  getTestMatchPattern(): string {
    const patterns = this.getTestMatchPatterns();
    
    if (patterns.length === 1) {
      return patterns[0];
    }
    
    // Combine multiple patterns using Playwright's pattern syntax
    return `{${patterns.join(',')}}`;
  }

  /**
   * Check if a specific test file should be included based on the tests array
   */
  shouldIncludeTest(testFilePath: string): boolean {
    if (this.tests.length === 0) {
      return true; // Include all tests if no filtering specified
    }

    return this.tests.some(test => {
      // If test ends with .test.ts, check for exact file match
      if (test.endsWith('.test.ts')) {
        return testFilePath.endsWith(test);
      }
      // Otherwise, check for folder name match
      else {
        return testFilePath.includes(`tests/${test}/`);
      }
    });
  }
}

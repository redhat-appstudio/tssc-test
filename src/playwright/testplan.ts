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

export interface TestPlanConfig {
  name: string;
  templates: string[];
  tssc: TSScConfig[];
  tests: string[];
}

export class TestPlan {
  // Support for new multiple test plans format
  testPlans?: TestPlanConfig[];
  
  // Support for legacy single test plan format (backward compatibility)
  templates?: string[];
  tsscConfigs?: TSScConfig[];
  tests?: string[];
  
  // Combined test items from all test plans
  testItems: TestItem[];
  
  // Map to track test items by plan name for efficient lookup
  private testItemsByPlan: Map<string, TestItem[]> = new Map();

  constructor(data: any) {
    this.testItems = [];
    this.testItemsByPlan = new Map();

    // Check if data has new format with testPlans array
    if (data.testPlans && Array.isArray(data.testPlans)) {
      // New format: multiple test plans
      this.testPlans = data.testPlans;
      this.processMultipleTestPlans();
    } else {
      // Legacy format: single test plan (backward compatibility)
      this.templates = data.templates || [];
      this.tsscConfigs = (data.tssc || []).map((config: any) => ({
        git: config.git || '',
        ci: config.ci || '',
        registry: config.registry || '',
        tpa: config.tpa || '',
        acs: config.acs || '',
        name: config.name,
      }));
      this.tests = data.tests || [];
      this.processLegacyTestPlan();
    }
  }

  private processMultipleTestPlans(): void {
    this.testPlans?.forEach(testPlan => {
      // Initialize the plan's test items array
      this.testItemsByPlan.set(testPlan.name, []);
      
      testPlan.templates.forEach(template => {
        testPlan.tssc.forEach(tsscConfig => {
          const itemName = tsscConfig.name || `${testPlan.name}-${template}-${randomString()}`;
          
          const testItem = new TestItem(
            itemName,
            template as TemplateType,
            tsscConfig.registry,
            tsscConfig.git,
            tsscConfig.ci,
            tsscConfig.tpa,
            tsscConfig.acs
          );
          
          // Add to global test items array
          this.testItems.push(testItem);
          
          // Add to plan-specific mapping
          const planItems = this.testItemsByPlan.get(testPlan.name) || [];
          planItems.push(testItem);
          this.testItemsByPlan.set(testPlan.name, planItems);
        });
      });
    });
  }

  private processLegacyTestPlan(): void {
    this.templates?.forEach(template => {
      this.tsscConfigs?.forEach(tsscConfig => {
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
    if (this.testPlans) {
      // New format: check across all test plans
      return this.testPlans.some(plan => plan.templates.includes(name));
    } else {
      // Legacy format
      return this.templates?.includes(name) || false;
    }
  }

  hasTest(name: string): boolean {
    if (this.testPlans) {
      // New format: check across all test plans
      return this.testPlans.some(plan => plan.tests.includes(name));
    } else {
      // Legacy format
      return this.tests?.includes(name) || false;
    }
  }

  getTestItems(): TestItem[] {
    return this.testItems;
  }

  getProjectConfigs(): Array<{
    name: string;
    testItem: TestItem;
  }> {
    return this.testItems.map(testItem => ({
      name: `${testItem.getTemplate()}[${testItem.getGitType()}-${testItem.getCIType()}-${testItem.getRegistryType()}-${testItem.getACS()}]`,
      testItem
    }));
  }

  // New methods for multiple test plans
  getTestPlans(): TestPlanConfig[] {
    return this.testPlans || [];
  }

  getTestPlanByName(name: string): TestPlanConfig | undefined {
    return this.testPlans?.find(plan => plan.name === name);
  }

  getTestItemsByPlanName(planName: string): TestItem[] {
    if (!this.testPlans) return [];
    
    const plan = this.getTestPlanByName(planName);
    if (!plan) return [];

    // Use the authoritative mapping if available
    const planItems = this.testItemsByPlan.get(planName);
    if (planItems && planItems.length > 0) {
      return planItems;
    }

    // Fallback to name-based filtering for backward compatibility
    return this.testItems.filter(item => 
      item.getName().startsWith(`${planName}-`)
    );
  }

  getTestsForPlan(planName: string): string[] {
    const plan = this.getTestPlanByName(planName);
    if (plan && plan.tests) {
      return plan.tests;
    }
    return [];
  }

  getTestMatchPatternsForPlan(planName: string): string[] {
    const tests = this.getTestsForPlan(planName);
    if (tests.length === 0) {
      return ['**/nonexistent.test.ts'];
    }
    
    return tests.map(test => {
      // Handle folder patterns (e.g., "ui", "tssc")
      if (!test.includes('.test.ts')) {
        return `tests/**/${test}/**/*.test.ts`;
      }
      // Handle specific test files (e.g., "ui/component.test.ts")
      return `tests/**/${test}`;
    });
  }

  getTestsForPlans(planNames: string[]): string[] {
    const allTests: string[] = [];
    for (const planName of planNames) {
      const tests = this.getTestsForPlan(planName);
      allTests.push(...tests);
    }
    return [...new Set(allTests)]; // Remove duplicates
  }

  getTestMatchPatternsForPlans(planNames: string[]): string[] {
    const allPatterns: string[] = [];
    for (const planName of planNames) {
      const patterns = this.getTestMatchPatternsForPlan(planName);
      allPatterns.push(...patterns);
    }
    return [...new Set(allPatterns)]; // Remove duplicates
  }

  // Helper methods for validation
  isValid(): boolean {
    if (this.testPlans) {
      // New format: validate all test plans
      return this.testPlans.length > 0 && 
             this.testPlans.every(plan => 
               plan.templates.length > 0 && plan.tssc.length > 0
             );
    } else {
      // Legacy format
      return (this.templates?.length || 0) > 0 && (this.tsscConfigs?.length || 0) > 0;
    }
  }

  getTotalProjectCount(): number {
    if (this.testPlans) {
      // New format: sum across all test plans
      return this.testPlans.reduce((total, plan) => 
        total + (plan.templates.length * plan.tssc.length), 0
      );
    } else {
      // Legacy format
      return (this.templates?.length || 0) * (this.tsscConfigs?.length || 0);
    }
  }

  getTemplateNames(): string[] {
    if (this.testPlans) {
      // New format: get unique templates across all plans
      const allTemplates = this.testPlans.flatMap(plan => plan.templates);
      return [...new Set(allTemplates)];
    } else {
      // Legacy format
      return [...(this.templates || [])];
    }
  }

  getTsscConfigNames(): string[] {
    if (this.testPlans) {
      // New format: get unique config names across all plans
      const allConfigs = this.testPlans.flatMap(plan => 
        plan.tssc.map(config => `${config.git}-${config.ci}`)
      );
      return [...new Set(allConfigs)];
    } else {
      // Legacy format
      return this.tsscConfigs?.map(config => `${config.git}-${config.ci}`) || [];
    }
  }

  // Get test plan names (new format only)
  getTestPlanNames(): string[] {
    return this.testPlans?.map(plan => plan.name) || [];
  }

  // Test filtering methods
  getTests(): string[] {
    // If using multiple test plans format, aggregate tests from all plans
    if (this.testPlans && Array.isArray(this.testPlans)) {
      const allTests: string[] = [];
      this.testPlans.forEach(plan => {
        if (plan.tests && Array.isArray(plan.tests)) {
          allTests.push(...plan.tests);
        }
      });
      return allTests;
    }
    
    // Fallback to legacy single test plan format
    return this.tests || [];
  }

  /**
   * Get test match patterns based on the tests array
   * Supports both folder patterns and specific test files
   */
  getTestMatchPatterns(): string[] {
    const tests = this.getTests();
    if (tests.length === 0) {
      // If no tests specified, return default pattern
      return ['**/*.test.ts'];
    }

    return tests.map(test => {
      // If test ends with .test.ts, treat as specific file
      if (test.endsWith('.test.ts')) {
        // If test already starts with tests/, use as is, otherwise add tests/ prefix
        return test.startsWith('tests/') ? test : `tests/**/${test}`;
      }
      // Otherwise, treat as folder name
      else {
        // If test already starts with tests/, use as is, otherwise add tests/ prefix
        return test.startsWith('tests/') ? `${test}/**/*.test.ts` : `tests/${test}/**/*.test.ts`;
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
    const tests = this.tests || [];
    if (tests.length === 0) {
      return true; // Include all tests if no filtering specified
    }

    return tests.some(test => {
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

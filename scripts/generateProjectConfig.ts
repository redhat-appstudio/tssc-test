#!/usr/bin/env ts-node

import { TestPlan } from '../src/playwright/testplan';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

interface ProjectConfig {
  name: string;
  testItem: any; // JSON representation of TestItem
}

/**
 * Standalone script to generate project configurations before Playwright runs
 * This ensures consistent TestItem instances across all test executions
 */
function generateProjectConfig(): void {
  try {
    // Load test plan
    const testPlanPath = process.env.TESTPLAN_PATH || path.resolve(process.cwd(), 'testplan.json');
    
    if (!existsSync(testPlanPath)) {
      throw new Error(`Test plan file not found: ${testPlanPath}`);
    }

    const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
    const testPlan = new TestPlan(testPlanData);

    // Generate project configurations with consistent TestItems
    const projectConfigs = testPlan.getProjectConfigs();
    
    console.log(`Generated ${projectConfigs.length} project configurations`);

    // Prepare serialized configurations
    const serializedConfigs: ProjectConfig[] = projectConfigs.map(config => ({
      name: config.name,
      testItem: config.testItem.toJSON()
    }));

    // Ensure output directory exists
    const outputPath = './tmp/project-configs.json';
    const outputDir = path.dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write configurations to file
    writeFileSync(outputPath, JSON.stringify(serializedConfigs, null, 2));

    // Also generate a summary for verification
    const summary = {
      generatedAt: new Date().toISOString(),
      testPlanPath,
      totalConfigurations: projectConfigs.length,
      testFiltering: {
        tests: testPlan.getTests(),
        testMatchPattern: testPlan.getTestMatchPattern(),
        testMatchPatterns: testPlan.getTestMatchPatterns()
      },
      testItems: projectConfigs.map(config => ({
        name: config.testItem.getName(),
        template: config.testItem.getTemplate(),
        git: config.testItem.getGitType(),
        ci: config.testItem.getCIType(),
        registry: config.testItem.getRegistryType()
      }))
    };

    writeFileSync('./tmp/project-config-summary.json', JSON.stringify(summary, null, 2));
    
    // Log test filtering information
    console.log(`Test filtering: ${testPlan.getTests().length > 0 ? testPlan.getTests().join(', ') : 'All tests'}`);
    console.log(`Test match pattern: ${testPlan.getTestMatchPattern()}`);
    console.log('Project configuration generation completed successfully!');

  } catch (error) {
    console.error('Failed to generate project configurations:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  generateProjectConfig();
}

export { generateProjectConfig }; 
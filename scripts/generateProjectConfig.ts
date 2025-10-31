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
    console.log(`Using test plan: ${testPlanPath}`);
    
    if (!existsSync(testPlanPath)) {
      throw new Error(`Test plan file not found: ${testPlanPath}`);
    }

    const testPlanData = JSON.parse(readFileSync(testPlanPath, 'utf-8'));
    const testPlan = new TestPlan(testPlanData);

    // Check if we have multiple test plans and if a specific plan is requested
    const requestedPlan = process.env.TESTPLAN_NAME;
    let projectConfigs: any[];
    let requestedPlans: string[] = [];

    if (requestedPlan && testPlan.getTestPlans().length > 0) {
      // New format: filter by specific test plan(s) - support comma-separated values
      requestedPlans = requestedPlan.split(',').map(name => name.trim()).filter(name => name.length > 0);
      console.log(`Filtering test items for plan(s): ${requestedPlans.join(', ')}`);
      
      // Collect test items from all requested plans
      const allTestItems: any[] = [];
      for (const planName of requestedPlans) {
        const testItems = testPlan.getTestItemsByPlanName(planName);
        allTestItems.push(...testItems);
      }
      
      projectConfigs = allTestItems.map(testItem => ({
        name: `${testItem.getTemplate()}[${testItem.getGitType()}-${testItem.getCIType()}-${testItem.getRegistryType()}-${testItem.getACS()}]`,
        testItem
      }));
    } else {
      // Generate all project configurations (legacy behavior or all plans)
      projectConfigs = testPlan.getProjectConfigs();
    }
    
    console.log(`Generated ${projectConfigs.length} project configurations`);

    // Log test plan information
    if (testPlan.getTestPlans().length > 0) {
      console.log(`Available test plans: ${testPlan.getTestPlanNames().join(', ')}`);
      if (requestedPlan) {
        console.log(`Using test plan: ${requestedPlan}`);
      } else {
        console.log('Using all test plans (no TESTPLAN_NAME specified)');
      }
    } else {
      console.log('Using legacy single test plan format');
    }

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
      requestedPlan: requestedPlan || 'all',
      availableTestPlans: testPlan.getTestPlanNames(),
      testFiltering: {
        tests: requestedPlan ? testPlan.getTestsForPlans(requestedPlans) : testPlan.getTests(),
        testMatchPattern: requestedPlan ? testPlan.getTestMatchPatternsForPlans(requestedPlans) : testPlan.getTestMatchPattern(),
        testMatchPatterns: requestedPlan ? testPlan.getTestMatchPatternsForPlans(requestedPlans) : testPlan.getTestMatchPatterns()
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
    const testsToShow = requestedPlan ? testPlan.getTestsForPlans(requestedPlans) : testPlan.getTests();
    const testMatchPattern = requestedPlan ? testPlan.getTestMatchPatternsForPlans(requestedPlans) : testPlan.getTestMatchPattern();
    console.log(`Test filtering: ${testsToShow.length > 0 ? testsToShow.join(', ') : 'All tests'}`);
    console.log(`Test match pattern: ${testMatchPattern}`);
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
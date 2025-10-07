import { readFileSync, existsSync } from 'fs';
import path from 'path';

export interface TestFilterInfo {
  tests: string[];
  testMatchPattern: string;
  testMatchPatterns: string[];
}

/**
 * Load test filtering information from the project configuration summary
 */
export function loadTestFilterInfo(): TestFilterInfo | null {
  const summaryPath = path.resolve(process.cwd(), 'tmp/project-config-summary.json');
  
  if (!existsSync(summaryPath)) {
    console.warn('Project configuration summary not found. Using default test patterns.');
    return null;
  }

  try {
    const data = readFileSync(summaryPath, 'utf-8');
    const summary = JSON.parse(data);
    
    if (summary.testFiltering) {
      return summary.testFiltering;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to load test filtering information:', error);
    return null;
  }
}

/**
 * Get the test match pattern for Playwright configuration
 */
export function getTestMatchPattern(): string {
  const testFilter = loadTestFilterInfo();
  
  if (testFilter && testFilter.testMatchPattern) {
    return testFilter.testMatchPattern;
  }
  
  // Default pattern if no filtering is specified
  return '**/*.test.ts';
}

import { TestItem } from '../playwright/testItem';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

/**
 * Add a test item to a JSON file containing all test items from current run
 */
export function exportTestItem(
  testItem: TestItem,
  outputPath: string = './tmp/test-items.json'
): void {
  // Create output directory if it doesn't exist
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  let exportData: any = {
    testItems: [],
    totalTestItems: 0,
  };

  // Read existing file
  if (existsSync(outputPath)) {
    try {
      const existingData = JSON.parse(readFileSync(outputPath, 'utf-8'));
      exportData = existingData;
    } catch (error) {
      console.warn('Could not read existing file, creating new one');
    }
  }

  // Add the new test item
  const newTestItemData = {
    ...testItem.toJSON(),
  };

  exportData.testItems.push(newTestItemData);
  exportData.totalTestItems = exportData.testItems.length;
  console.log(`➕ Added test item: ${testItem.getName()}`);

  // Write back to file
  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`✅ Updated file with ${exportData.totalTestItems} test items: ${outputPath}`);
}

/**
 * Reset the test items file
 */
export function resetTestItemsFile(outputPath: string = './tmp/test-items.json'): void {
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const exportData = {
    testItems: [],
    totalTestItems: 0,
  };

  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`🔄 Reset test items file: ${outputPath}`);
}

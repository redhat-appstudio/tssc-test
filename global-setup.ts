// Import default logger as fallback
import { FullConfig } from '@playwright/test';
import { Logger } from 'pino';

import { closeAllLoggers, defaultLogger } from './src/log/logger';
import { resetTestItemsFile } from './src/utils/testItemExporter';
import { checkClis } from './src/utils/cliChecker';

/**
 * Global setup function for Playwright tests
 */
async function globalSetup(config: FullConfig): Promise<void> {
  const log: Logger = defaultLogger;

  log.info('Starting test suite setup (Global Setup)');

  try {
    // Check CLI dependencies first (fails fast if missing)
    await checkClis({
      error: (msg: string) => log.error(msg),
    });
    // Skip reset when running UI tests
    const isUITest = process.env.UI_TEST === 'true';

    if (!isUITest) {
      log.info('Resetting test items file...');
      resetTestItemsFile();
    } else {
      log.info('Skipping test items reset for UI tests');
    }

    log.info('Global setup completed successfully');
  } catch (error) {
    log.error({ err: error }, 'Global setup failed!');
    throw error;
  }
}

/**
 * Global teardown function for Playwright tests
 */
async function globalTeardown(config: FullConfig): Promise<void> {
  console.log('Ensuring all logs are properly flushed to disk...');

  try {
    await closeAllLoggers();
    console.log('All loggers closed successfully');
  } catch (error) {
    console.error('Error closing loggers:', error);
  }
}

export { globalTeardown };
export default globalSetup;
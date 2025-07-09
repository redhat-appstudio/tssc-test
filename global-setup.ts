// Import default logger as fallback
import { closeAllLoggers, defaultLogger } from './src/log/logger';
import { resetTestItemsFile } from './src/utils/testItemExporter';
import { FullConfig } from '@playwright/test';
import { Logger } from 'pino';

async function globalSetup(config: FullConfig) {
  const log: Logger = defaultLogger;

  log.info('Starting test suite setup (Global Setup)');

  try {
    // Skip reset when running UI tests
    const isUITest = process.env.UI_TEST === 'true';

    if (!isUITest) {
      resetTestItemsFile();
    }

    log.info('Global setup completed successfully.');
  } catch (error) {
    log.error({ err: error }, 'Global setup failed!'); // Use err serializer
    // Re-throw the error to fail the setup process
    throw error;
  }
}

async function globalTeardown(config: FullConfig) {
  console.log('Ensuring all logs are properly flushed to disk...');
  await closeAllLoggers();
}

export { globalTeardown };
export default globalSetup;
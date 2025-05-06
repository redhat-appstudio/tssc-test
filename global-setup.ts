import { FullConfig } from '@playwright/test';
import { Logger } from 'pino'; // Import Logger type
import { closeAllLoggers, defaultLogger } from './src/log/logger'; // Import default logger as fallback

async function globalSetup(config: FullConfig) {
  const log: Logger = defaultLogger;

  log.info('Starting test suite setup (Global Setup)');

  try {
    // --- Your existing global setup logic here ---
    // Example: log.debug('Performing pre-suite actions...');
    // ---

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
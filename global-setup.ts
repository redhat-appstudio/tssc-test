import { FullConfig } from '@playwright/test';
import { checkClis } from './src/utils/cliChecker';
import { LoggerFactory } from './src/logger/logger';
import { loadConfigFromEnv } from './src/logger/logger';

/**
 * Global setup function for Playwright tests
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('Starting test suite setup (Global Setup)');

  try {
    // Configure logger with environment-based config
    LoggerFactory.configure(loadConfigFromEnv());
    console.log('✓ Logger configured successfully');

    // Check CLI dependencies first (fails fast if missing)
    await checkClis({
      error: (msg: string) => console.error(msg),
    });
  } catch (error) {
    console.error({ err: error }, 'Global setup failed!');
    throw error;
  }
}

export default globalSetup;
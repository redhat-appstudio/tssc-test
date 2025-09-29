import { FullConfig } from '@playwright/test';
import { checkClis } from './src/utils/cliChecker';

/**
 * Global setup function for Playwright tests
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('Starting test suite setup (Global Setup)');

  try {
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
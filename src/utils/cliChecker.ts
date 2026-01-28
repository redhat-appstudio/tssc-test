import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { LoggerFactory } from '../logger/factory/loggerFactory';
import { Logger } from '../logger/logger';

// Use the same exec pattern as the existing ArgoCD implementation
const exec = promisify(execCallback);
const logger: Logger = LoggerFactory.getLogger('utils.cli-checker');

/**
 * Checks if ArgoCD CLI is available using the same pattern as the existing ArgoCD service
 * @returns true if ArgoCD CLI is installed, false otherwise
 */
export async function checkArgoCDCli(): Promise<boolean> {
  try {
    // Use the same command pattern as in sync.service.ts
    const command = 'argocd version --client';
    logger.info('Checking ArgoCD CLI availability: {}', command);
    
    const { stderr } = await exec(command);
    
    if (stderr && stderr.trim()) {
      logger.warn('ArgoCD CLI check warnings: {}', stderr);
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Checks all required CLIs and fails fast if any are missing
 * Only logs errors when CLIs are not available
 */
export async function checkClis(
  logger?: { error: (msg: string) => void }
): Promise<void> {
  const log = logger || console;
  
  const isArgoCDAvailable = await checkArgoCDCli();
  
  if (!isArgoCDAvailable) {
    const errorMessage = 
      `ArgoCD CLI is required but not found.\n\n`;
    
    log.error(errorMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Async Context Injector
 *
 * Injects test context from AsyncLocalStorage into log metadata.
 * Automatically adds projectName and worker information when available.
 */

import { IContextInjector } from './IContextInjector';
import { getCurrentTestContext } from '../../context/testContextStorage';

/**
 * AsyncLocalStorage-based Context Injector
 *
 * Retrieves context from AsyncLocalStorage and merges it with user metadata.
 * Context takes precedence to prevent user override of auto-injected fields.
 */
export class AsyncContextInjector implements IContextInjector {
  /**
   * Enrich metadata with context from AsyncLocalStorage
   *
   * @param metadata - User-provided metadata (optional)
   * @returns Enriched metadata with context injected
   */
  enrichMetadata(metadata?: object): object | undefined {
    // Get current test context (if running within a test)
    const context = getCurrentTestContext();

    // If no context and no metadata, return undefined
    if (!context && !metadata) {
      return undefined;
    }

    // If no context but metadata exists, return metadata as-is
    if (!context) {
      return metadata;
    }

    // If context exists but no metadata, return context
    if (!metadata) {
      return context;
    }

    // Merge metadata and context (context takes precedence)
    return {
      ...metadata,  // User-provided metadata
      ...context,   // Auto-injected context (overrides user metadata)
    };
  }
}

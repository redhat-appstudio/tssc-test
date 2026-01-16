/**
 * Context Injector Interface
 *
 * Defines the contract for context injection strategies.
 * Implementations can inject context from various sources:
 * - AsyncLocalStorage (for async context propagation)
 * - Global context manager (fallback)
 * - Environment variables
 * - Request-scoped context
 */

export interface IContextInjector {
  /**
   * Enrich metadata with context information
   *
   * @param metadata - User-provided metadata (optional)
   * @returns Enriched metadata with context injected
   */
  enrichMetadata(metadata?: object): object | undefined;
}

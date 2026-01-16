/**
 * Logger - Composite Pattern Implementation
 *
 * Main logger class that composes feature components:
 * - Message formatter (supports parameterized logging)
 * - Context injector (injects test context from AsyncLocalStorage)
 * - Transport (delegates to Winston or other logging libraries)
 *
 * This design decouples the logger from specific implementations,
 * making features independently testable and swappable.
 */

import { IMessageFormatter } from '../features/formatting/IMessageFormatter';
import { IContextInjector } from '../features/context/IContextInjector';
import { ILogTransport } from '../adapters/ILogTransport';

/**
 * Logger Class
 *
 * Orchestrates message formatting, context injection, and transport
 * to provide a clean, composable logging interface.
 */
export class Logger {
  constructor(
    private readonly transport: ILogTransport,
    private readonly formatter: IMessageFormatter,
    private readonly contextInjector: IContextInjector
  ) {}

  /**
   * Log at trace level with optional placeholders
   *
   * @example
   * logger.trace("User {} accessed resource {}", userId, resourceId);
   * logger.trace("Processing request", { requestId, method });
   * logger.trace("User {} accessed {}", userId, resource, { timestamp, ipAddress });
   */
  trace(message: string, ...params: any[]): void {
    // 1. Format message (handle {} placeholders)
    const { message: formattedMessage, metadata: formatterMetadata } = this.formatter.format(message, params);
    
    // 2. Enrich with context (projectName, worker, etc.)
    const enrichedMetadata = this.contextInjector.enrichMetadata(formatterMetadata);
    
    // 3. Delegate to transport (winston)
    this.transport.log('trace', formattedMessage, enrichedMetadata);
  }

  /**
   * Log at debug level with optional placeholders
   *
   * @example
   * logger.debug("Fetching data for user {}", userId);
   * logger.debug("Cache hit", { key, ttl });
   * logger.debug("Query {} returned {} rows", query, rowCount, { executionTime });
   */
  debug(message: string, ...params: any[]): void {
    const { message: formattedMessage, metadata: formatterMetadata } = this.formatter.format(message, params);
    const enrichedMetadata = this.contextInjector.enrichMetadata(formatterMetadata);
    this.transport.log('debug', formattedMessage, enrichedMetadata);
  }

  /**
   * Log at info level with optional placeholders
   *
   * @example
   * logger.info("User {} logged in from {}", username, ipAddress);
   * logger.info('Component created', { componentName, repository });
   * logger.info("Processing {} items from {}", count, source, { batchId });
   */
  info(message: string, ...params: any[]): void {
    const { message: formattedMessage, metadata: formatterMetadata } = this.formatter.format(message, params);
    const enrichedMetadata = this.contextInjector.enrichMetadata(formatterMetadata);
    this.transport.log('info', formattedMessage, enrichedMetadata);
  }

  /**
   * Log at warn level with optional placeholders
   *
   * @example
   * logger.warn("Retry attempt {} of {}", currentAttempt, maxAttempts);
   * logger.warn('Rate limit approaching', { currentRate, limit });
   * logger.warn("Slow query detected: {}ms", duration, { query, threshold });
   */
  warn(message: string, ...params: any[]): void {
    const { message: formattedMessage, metadata: formatterMetadata } = this.formatter.format(message, params);
    const enrichedMetadata = this.contextInjector.enrichMetadata(formatterMetadata);
    this.transport.log('warn', formattedMessage, enrichedMetadata);
  }

  /**
   * Log at error level with optional placeholders
   *
   * @example
   * logger.error("Failed to connect to {}", host);
   * logger.error('Operation failed', { error: err.message, retryCount });
   * logger.error("Timeout after {}ms waiting for {}", timeout, resource, { requestId });
   */
  error(message: string, ...params: any[]): void {
    const { message: formattedMessage, metadata: formatterMetadata } = this.formatter.format(message, params);
    const enrichedMetadata = this.contextInjector.enrichMetadata(formatterMetadata);
    this.transport.log('error', formattedMessage, enrichedMetadata);
  }

  /**
   * Get the underlying logger instance (escape hatch for advanced use cases)
   *
   * @returns The underlying logger implementation (e.g., Winston logger)
   */
  getUnderlyingLogger(): any {
    return this.transport.getUnderlyingLogger();
  }
}

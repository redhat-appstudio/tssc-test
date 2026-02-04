/**
 * Logger - Simplified Implementation
 *
 * Main logger class that provides logging with automatic context injection.
 * Uses Winston directly for transport.
 * Uses template literals for message formatting.
 */

import * as winston from 'winston';
import { AsyncContextInjector } from '../features/context/AsyncContextInjector';

/**
 * Logger Class
 *
 * Provides logging methods with automatic test context injection.
 * Use template literals for dynamic messages: logger.info(`User ${username} logged in`)
 */
export class Logger {
  private contextInjector = new AsyncContextInjector();

  constructor(private readonly winstonLogger: winston.Logger) {}

  /**
   * Log at trace level
   *
   * @example
   * logger.trace(`User ${userId} accessed resource ${resourceId}`);
   * logger.trace('Processing request', { requestId, method });
   */
  trace(message: string, metadata?: object): void {
    const enriched = this.contextInjector.enrichMetadata(metadata);
    this.winstonLogger.log('trace', message, enriched);
  }

  /**
   * Log at debug level
   *
   * @example
   * logger.debug(`Fetching data for user ${userId}`);
   * logger.debug('Cache hit', { key, ttl });
   */
  debug(message: string, metadata?: object): void {
    const enriched = this.contextInjector.enrichMetadata(metadata);
    this.winstonLogger.log('debug', message, enriched);
  }

  /**
   * Log at info level
   *
   * @example
   * logger.info(`User ${username} logged in from ${ipAddress}`);
   * logger.info('Component created', { componentName, repository });
   */
  info(message: string, metadata?: object): void {
    const enriched = this.contextInjector.enrichMetadata(metadata);
    this.winstonLogger.log('info', message, enriched);
  }

  /**
   * Log at warn level
   *
   * @example
   * logger.warn(`Retry attempt ${currentAttempt} of ${maxAttempts}`);
   * logger.warn('Rate limit approaching', { currentRate, limit });
   */
  warn(message: string, metadata?: object): void {
    const enriched = this.contextInjector.enrichMetadata(metadata);
    this.winstonLogger.log('warn', message, enriched);
  }

  /**
   * Log at error level
   *
   * @example
   * logger.error(`Failed to connect to ${host}`);
   * logger.error('Operation failed', { error: err.message, retryCount });
   */
  error(message: string, metadata?: object): void {
    const enriched = this.contextInjector.enrichMetadata(metadata);
    this.winstonLogger.log('error', message, enriched);
  }

  /**
   * Get the underlying Winston logger instance (escape hatch for advanced use cases)
   *
   * @returns The underlying Winston logger instance
   */
  getUnderlyingLogger(): winston.Logger {
    return this.winstonLogger;
  }
}

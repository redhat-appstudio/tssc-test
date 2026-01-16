/**
 * Log Transport Interface
 *
 * Defines the contract for log transport implementations.
 * Decouples the Logger from specific logging libraries (Winston, Pino, Bunyan, etc.)
 * allowing easy swapping of underlying transport mechanisms.
 */

import { LogLevel } from '../types/logger.types';

/**
 * Log Transport Interface
 */
export interface ILogTransport {
  /**
   * Write a log entry to the transport
   *
   * @param level - Log level
   * @param message - Formatted message
   * @param metadata - Optional metadata object
   */
  log(level: LogLevel, message: string, metadata?: object): void;

  /**
   * Get the underlying logger instance (escape hatch for advanced use cases)
   *
   * @returns The underlying logger implementation
   */
  getUnderlyingLogger(): any;
}

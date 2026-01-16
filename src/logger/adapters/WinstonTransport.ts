/**
 * Winston Transport Adapter
 *
 * Adapts Winston logger to the ILogTransport interface.
 * Allows the Logger class to be decoupled from Winston-specific APIs.
 */

import type { Logger as WinstonLogger } from 'winston';
import { ILogTransport } from './ILogTransport';
import { LogLevel } from '../types/logger.types';

/**
 * Winston Transport Implementation
 *
 * Wraps a Winston logger instance and delegates logging operations.
 * Supports all standard log levels plus custom 'trace' level.
 */
export class WinstonTransport implements ILogTransport {
  constructor(private readonly winstonLogger: WinstonLogger) {}

  /**
   * Write a log entry using Winston
   *
   * @param level - Log level
   * @param message - Formatted message
   * @param metadata - Optional metadata object
   */
  log(level: LogLevel, message: string, metadata?: object): void {
    this.winstonLogger.log(level, message, metadata);
  }

  /**
   * Get the underlying Winston logger (escape hatch)
   *
   * @returns Winston logger instance
   */
  getUnderlyingLogger(): WinstonLogger {
    return this.winstonLogger;
  }
}

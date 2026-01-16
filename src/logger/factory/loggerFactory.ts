/**
 * LoggerFactory - Singleton factory for managing logger instances
 * Provides Java/slf4j-style API: LoggerFactory.getLogger(ClassName)
 */

import * as winston from 'winston';
import { LoggerConfig, LoggerName } from '../types/logger.types';
import { LoggerMetadata } from '../types/metadata.types';
import { mergeConfig, DEFAULT_LOGGER_CONFIG } from '../config/loggerConfig';
import { createConsoleTransport } from '../transports/consoleTransport';
import { createRotatingFileTransport } from '../transports/rotatingFileTransport';
import { Logger } from '../core/Logger';
import { ParameterizedFormatter } from '../features/formatting/ParameterizedFormatter';
import { AsyncContextInjector } from '../features/context/AsyncContextInjector';
import { WinstonTransport } from '../adapters/WinstonTransport';

/**
 * LoggerFactory singleton class
 * Manages logger instance creation, caching, and configuration
 */
class LoggerFactoryClass {
  private static instance: LoggerFactoryClass;
  private loggers: Map<string, Logger> = new Map();
  private config: LoggerConfig = DEFAULT_LOGGER_CONFIG;
  private rootLogger: winston.Logger | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): LoggerFactoryClass {
    if (!LoggerFactoryClass.instance) {
      LoggerFactoryClass.instance = new LoggerFactoryClass();
    }
    return LoggerFactoryClass.instance;
  }

  /**
   * Configure logger (must be called before creating loggers)
   * Similar to configuring log4j.properties
   */
  public configure(userConfig: Partial<LoggerConfig>): void {
    this.config = mergeConfig(userConfig);

    // Clear existing loggers to apply new configuration
    this.loggers.clear();
    this.rootLogger = null;
  }

  /**
   * Get or create a logger instance with parameterized logging support
   * Java-style API: LoggerFactory.getLogger(ClassName) or LoggerFactory.getLogger('LoggerName')
   *
   * AUTOMATICALLY injects metadata (zero effort required):
   * - projectName: From testInfo.project.name (e.g., 'e2e-go[github-tekton-quay-remote]')
   * - worker: Worker/parallel index (e.g., 0, 1, 2...)
   * - timestamp: Automatic via Winston formatter
   *
   * Supports three logging styles:
   * 1. Parameterized: logger.info("User {} logged in from {}", username, ipAddress)
   * 2. Structured: logger.info('User logged in', { username, ipAddress })
   * 3. Mixed: logger.info("Processing {} items", count, { batchId, timestamp })
   *
   * @param name - Logger name (string or class constructor)
   * @param metadata - Optional additional metadata for this logger
   * @returns Logger instance with {} placeholder support and context injection
   */
  public getLogger(name: LoggerName, metadata?: LoggerMetadata): Logger {
    // Convert class constructor to string name
    const loggerName = typeof name === 'function' ? name.name : name;

    // NOTE: Do NOT bake context into child logger metadata
    // Context should be injected dynamically by AsyncContextInjector at log time
    // This allows context to be picked up even if it wasn't available at logger creation
    const combinedMetadata = {
      ...metadata, // Only use user-provided metadata
    };

    // IMPORTANT: NEVER use cache - always create fresh loggers
    // This ensures loggers can pick up context from AsyncLocalStorage dynamically
    // Caching causes stale loggers that were created without context to be reused
    const shouldUseCache = false; // Disabled to ensure context propagation

    if (shouldUseCache && this.loggers.has(loggerName)) {
      return this.loggers.get(loggerName)!;
    }

    // Create root logger if not exists
    if (!this.rootLogger) {
      this.rootLogger = this.createRootLogger();
    }

    // Create child logger with combined metadata
    const winstonLogger = this.rootLogger.child({
      logger: loggerName,
      ...combinedMetadata,
    });

    // Compose Logger with feature components
    const formatter = new ParameterizedFormatter();
    const contextInjector = new AsyncContextInjector();
    const transport = new WinstonTransport(winstonLogger);

    const logger = new Logger(transport, formatter, contextInjector);

    // NOTE: Caching disabled to support dynamic context injection
    // Each logger instance can pick up fresh context from AsyncLocalStorage

    return logger;
  }

  /**
   * Create root logger with configured transports
   */
  private createRootLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // Add console transport if enabled
    if (this.config.console?.enabled) {
      const consoleTransport = createConsoleTransport(this.config.console);
      if (consoleTransport) {
        transports.push(consoleTransport);
      }
    }

    // Add file transport if enabled
    if (this.config.file?.enabled) {
      const fileTransport = createRotatingFileTransport(this.config.file);
      if (fileTransport) {
        transports.push(fileTransport);
      }
    }

    // Create Winston logger with configured transports
    const logger = winston.createLogger({
      level: this.config.level,
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        trace: 4,
      },
      transports,
      exitOnError: false,
      handleExceptions: this.config.exceptionHandling?.handleExceptions !== false,
      handleRejections: this.config.exceptionHandling?.handleRejections !== false,
    });

    // Add custom log level methods
    winston.addColors({
      trace: 'magenta',
      debug: 'blue',
      info: 'green',
      warn: 'yellow',
      error: 'red',
    });

    return logger;
  }

  /**
   * Shutdown all loggers and flush pending logs
   */
  public async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.rootLogger) {
      promises.push(
        new Promise<void>((resolve, reject) => {
          // Add timeout to prevent hanging forever
          const timeout = setTimeout(() => {
            reject(new Error('Logger shutdown timeout after 5 seconds'));
          }, 5000);

          this.rootLogger!.on('finish', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          this.rootLogger!.on('error', (error) => {
            clearTimeout(timeout);
            console.error('Error during logger shutdown:', error);
            reject(error);
          });

          try {
            this.rootLogger!.end();
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        })
      );
    }

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error('Logger shutdown failed:', error);
    } finally {
      this.loggers.clear();
      this.rootLogger = null;
    }
  }
}

/**
 * Export singleton instance as LoggerFactory
 */
export const LoggerFactory = LoggerFactoryClass.getInstance();

/**
 * Close all loggers (graceful shutdown)
 */
export async function closeAllLoggers(): Promise<void> {
  return LoggerFactory.shutdown();
}

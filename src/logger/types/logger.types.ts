/**
 * Logger type definitions for Winston-based logging system
 */

/**
 * Log level type - slf4j-style levels
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Log format type - determines output formatting style
 */
export type LogFormat = 'text' | 'json';

/**
 * Console transport configuration
 */
export interface ConsoleTransportConfig {
  enabled: boolean;
  level?: LogLevel;
  format?: LogFormat;
  colorize?: boolean;
  prettyPrint?: boolean;
  timestamp?: boolean;
}

/**
 * File transport configuration
 */
export interface FileTransportConfig {
  enabled: boolean;
  level?: LogLevel;
  directory: string;
  filename: string;
  datePattern?: string;
  maxSize?: string;
  maxFiles?: string | number;
  format?: LogFormat;
  compress?: boolean;
}

/**
 * Exception handling configuration
 */
export interface ExceptionHandlingConfig {
  handleExceptions?: boolean;
  handleRejections?: boolean;
}

/**
 * Complete logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  console?: ConsoleTransportConfig;
  file?: FileTransportConfig;
  exceptionHandling?: ExceptionHandlingConfig;
}



/**
 * Logger class or string type for getLogger()
 */
export type LoggerName = string | Function;

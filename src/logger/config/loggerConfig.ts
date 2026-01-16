/**
 * Logger configuration system with defaults and environment variable support
 */

import { LoggerConfig, LogLevel, LogFormat, VALID_LOG_LEVELS, VALID_LOG_FORMATS } from '../types/logger.types';

/**
 * Default logger configuration
 * Similar to log4j.properties defaults
 */
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  level: 'info',
  console: {
    enabled: true,
    level: 'info',
    format: 'text',      // New default: text format for console
    colorize: true,
    prettyPrint: true,
    timestamp: true,
  },
  file: {
    enabled: true,
    level: 'debug',
    directory: './logs',
    filename: 'test-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: 'json',      // Default: JSON format for file
    compress: false,
  },
  exceptionHandling: {
    handleExceptions: true,
    handleRejections: true,
  },
};

/**
 * Parse log level from environment variable
 */
function parseLogLevel(value: string | undefined, defaultLevel: LogLevel): LogLevel {
  if (!value) return defaultLevel;

  const level = value.toLowerCase();

  if (VALID_LOG_LEVELS.includes(level as LogLevel)) {
    return level as LogLevel;
  }

  console.warn(`Invalid log level "${value}", using default "${defaultLevel}"`);
  return defaultLevel;
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse log format from environment variable
 */
function parseLogFormat(value: string | undefined, defaultFormat: LogFormat): LogFormat {
  if (!value) return defaultFormat;

  const format = value.toLowerCase();

  if (VALID_LOG_FORMATS.includes(format as LogFormat)) {
    return format as LogFormat;
  }

  console.warn(`Invalid log format "${value}", using default "${defaultFormat}"`);
  return defaultFormat;
}

/**
 * Load configuration from environment variables
 * Maps environment variables to logger configuration (like log4j.properties)
 *
 * Supported environment variables:
 * - LOG_LEVEL: Global log level (trace|debug|info|warn|error)
 * - LOG_CONSOLE_ENABLED: Enable console logging (true|false)
 * - LOG_CONSOLE_LEVEL: Console log level
 * - LOG_CONSOLE_FORMAT: Console output format (text|json)
 * - LOG_FILE_ENABLED: Enable file logging (true|false)
 * - LOG_FILE_LEVEL: File log level
 * - LOG_FILE_FORMAT: File output format (text|json)
 * - LOG_FILE_DIRECTORY: Log file directory path
 * - LOG_FILE_MAX_SIZE: Maximum file size (e.g., 20m, 100k)
 * - LOG_FILE_MAX_FILES: Maximum files to keep (e.g., 14d, 10)
 */
export function loadConfigFromEnv(): LoggerConfig {
  const baseConfig = { ...DEFAULT_LOGGER_CONFIG };

  // Global log level
  if (process.env.LOG_LEVEL) {
    baseConfig.level = parseLogLevel(process.env.LOG_LEVEL, baseConfig.level);
  }

  // Console configuration
  if (baseConfig.console) {
    baseConfig.console = {
      ...baseConfig.console,
      enabled: parseBoolean(process.env.LOG_CONSOLE_ENABLED, baseConfig.console.enabled),
      level: parseLogLevel(process.env.LOG_CONSOLE_LEVEL, baseConfig.console.level || 'info'),
      format: parseLogFormat(process.env.LOG_CONSOLE_FORMAT, baseConfig.console.format || 'text'),
    };
  }

  // File configuration
  if (baseConfig.file) {
    baseConfig.file = {
      ...baseConfig.file,
      enabled: parseBoolean(process.env.LOG_FILE_ENABLED, baseConfig.file.enabled),
      level: parseLogLevel(process.env.LOG_FILE_LEVEL, baseConfig.file.level || 'debug'),
      format: parseLogFormat(process.env.LOG_FILE_FORMAT, baseConfig.file.format || 'json'),
      directory: process.env.LOG_FILE_DIRECTORY || baseConfig.file.directory,
      maxSize: process.env.LOG_FILE_MAX_SIZE || baseConfig.file.maxSize,
      maxFiles: process.env.LOG_FILE_MAX_FILES || baseConfig.file.maxFiles,
    };
  }

  return baseConfig;
}

/**
 * Validate logger configuration
 * Throws error if configuration is invalid
 */
export function validateConfig(config: LoggerConfig): void {
  if (!config.level) {
    throw new Error('Logger configuration must specify a log level');
  }

  if (!VALID_LOG_LEVELS.includes(config.level)) {
    throw new Error(`Invalid log level: ${config.level}`);
  }

  if (config.file?.enabled && !config.file.directory) {
    throw new Error('File logging enabled but no directory specified');
  }

  if (config.file?.enabled && !config.file.filename) {
    throw new Error('File logging enabled but no filename specified');
  }
}

/**
 * Merge user configuration with defaults
 */
export function mergeConfig(userConfig: Partial<LoggerConfig>): LoggerConfig {
  const merged: LoggerConfig = {
    level: userConfig.level || DEFAULT_LOGGER_CONFIG.level,
    console: userConfig.console
      ? { ...DEFAULT_LOGGER_CONFIG.console!, ...userConfig.console }
      : DEFAULT_LOGGER_CONFIG.console!,
    file: userConfig.file
      ? { ...DEFAULT_LOGGER_CONFIG.file!, ...userConfig.file }
      : DEFAULT_LOGGER_CONFIG.file!,
    exceptionHandling: userConfig.exceptionHandling
      ? { ...DEFAULT_LOGGER_CONFIG.exceptionHandling!, ...userConfig.exceptionHandling }
      : DEFAULT_LOGGER_CONFIG.exceptionHandling!,
  };

  validateConfig(merged);
  return merged;
}

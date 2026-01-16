/**
 * Text formatter for single-line human-readable logging
 * Format: timestamp [level] logger: message {key=value, key=value}
 *
 * Optimized for:
 * - Visual scanability in console output
 * - Grep-friendly metadata (e.g., grep "worker=0")
 * - Copy-paste safe (no special characters)
 * - Single-line format (no multi-line breaking)
 */

import * as winston from 'winston';
import { getCurrentTestContext } from '../context/testContext';

/**
 * Colorize log level with ANSI colors
 */
function colorizeLevel(level: string): string {
  const colors: Record<string, string> = {
    trace: '\x1b[35m', // magenta
    debug: '\x1b[34m', // blue
    info: '\x1b[32m',  // green
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';
  const color = colors[level.toLowerCase()] || '';
  return `${color}${level.toUpperCase().padEnd(5)}${reset}`;
}

/**
 * Create text formatter for console/file output
 * Format: YYYY-MM-DD HH:mm:ss.SSS [LEVEL] LoggerName: message {key=value, key=value}
 */
export function createTextFormatter(colorize: boolean = true): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    // Custom format to inject test context dynamically at log time
    winston.format((info) => {
      const testContext = getCurrentTestContext();

      if (testContext?.projectName) {
        info.projectName = testContext.projectName;
      }
      if (testContext?.worker !== undefined) {
        info.worker = testContext.worker;
      }

      return info;
    })(),
    winston.format.printf((info) => {
      const { timestamp, level, message, logger, ...metadata } = info;

      // Format log level with optional colors
      const displayLevel = colorize ? colorizeLevel(level) : level.toUpperCase().padEnd(5);

      // Base log line
      let output = `${timestamp} [${displayLevel}]`;

      // Add logger name if available
      if (logger) {
        output += ` ${logger}:`;
      }

      output += ` ${message}`;

      // Add metadata in {key=value, key=value} format
      const metadataKeys = Object.keys(metadata).filter(
        // Filter out internal Winston fields
        (key) => !key.startsWith('_') && key !== 'Symbol(level)'
      );

      if (metadataKeys.length > 0) {
        const metadataPairs = metadataKeys.map((key) => {
          const value = metadata[key];

          // Handle different value types
          if (value === null || value === undefined) {
            return `${key}=null`;
          } else if (typeof value === 'object') {
            // Compact JSON representation for objects
            return `${key}=${JSON.stringify(value)}`;
          } else if (typeof value === 'string') {
            // Quote strings if they contain spaces or special characters
            const needsQuotes = /[\s,={}]/.test(value);
            return needsQuotes ? `${key}="${value}"` : `${key}=${value}`;
          } else {
            return `${key}=${value}`;
          }
        });

        output += ` {${metadataPairs.join(', ')}}`;
      }

      return output;
    })
  );
}

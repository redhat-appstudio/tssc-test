/**
 * JSON formatter for structured file logging
 * Outputs logs in JSON Lines format with standardized field names
 *
 * Field mapping:
 * - timestamp: ISO timestamp (YYYY-MM-DDTHH:mm:ss.SSSZ)
 * - level: Log level (trace, debug, info, warn, error)
 * - logger: Logger name (e.g., "GithubClient")
 * - message: The actual log message
 * - Additional metadata fields preserved as-is (projectName, worker, etc.)
 */

import * as winston from 'winston';
import { getCurrentTestContext } from '../context/testContextStorage';

/**
 * Create JSON formatter for file output
 * Output format: JSON Lines (one JSON object per line)
 */
export function createJsonFormatter(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }), // ISO 8601 format
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
    // Transform to standardized JSON structure
    winston.format.printf((info) => {
      const { timestamp, level, message, logger, projectName, ...metadata } = info;

      // Build standardized log entry
      const logEntry: Record<string, any> = {
        timestamp: timestamp,
        level: level,
        logger: logger || 'root',
        message: message,
      };

      // Add projectName if present
      if (projectName) {
        logEntry.projectName = projectName;
      }

      // Add all other metadata fields
      Object.keys(metadata).forEach((key) => {
        // Filter out internal Winston fields
        if (!key.startsWith('_') && key !== 'Symbol(level)') {
          logEntry[key] = metadata[key];
        }
      });

      return JSON.stringify(logEntry);
    })
  );
}

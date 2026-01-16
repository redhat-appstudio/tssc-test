/**
 * Console transport configuration for Winston
 * Handles console output with selectable formatting (text, json)
 */

import * as winston from 'winston';
import { ConsoleTransportConfig } from '../types/logger.types';
import { createTextFormatter } from '../formatters/textFormatter';
import { createJsonFormatter } from '../formatters/jsonFormatter';

/**
 * Create console transport with configurable formatting
 * @returns Winston console transport or null if disabled
 */
export function createConsoleTransport(config: ConsoleTransportConfig): winston.transport | null {
  if (!config.enabled) {
    return null;
  }

  try {
    // Select formatter based on config
    let formatter;
    const format = config.format || 'text'; // Default to text format

    switch (format) {
      case 'text':
        // Single-line {key=value} format
        formatter = createTextFormatter(config.colorize !== false);
        break;
      case 'json':
        // JSON Lines format (one JSON object per line)
        formatter = createJsonFormatter();
        break;
      default:
        // Fallback to text format
        console.warn(`Unknown console format "${format}", using text format`);
        formatter = createTextFormatter(config.colorize !== false);
    }

    return new winston.transports.Console({
      level: config.level || 'info',
      format: formatter,
    });
  } catch (error) {
    console.error('Failed to create console transport:', error);
    throw new Error(
      `Console transport creation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

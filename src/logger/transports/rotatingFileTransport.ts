/**
 * Rotating file transport configuration for Winston
 * Handles daily rotating file output with configurable formatting
 */

import * as winston from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');
import { FileTransportConfig } from '../types/logger.types';
import { createJsonFormatter } from '../formatters/jsonFormatter';
import { createTextFormatter } from '../formatters/textFormatter';
import * as fs from 'fs';

/**
 * Create rotating file transport with configurable formatting
 * @returns Winston file transport or null if disabled
 */
export function createRotatingFileTransport(config: FileTransportConfig): winston.transport | null {
  if (!config.enabled) {
    return null;
  }

  // Ensure log directory exists with error handling
  try {
    if (!fs.existsSync(config.directory)) {
      fs.mkdirSync(config.directory, { recursive: true });
    }
  } catch (error) {
    const errorMsg = `Failed to create log directory '${config.directory}': ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Select formatter based on config
    let formatter;
    const format = config.format || 'json'; // Default to JSON for file output

    switch (format) {
      case 'json':
        // JSON Lines format (best for log aggregation)
        formatter = createJsonFormatter();
        break;
      case 'text':
        // Single-line {key=value} format (no colors for files)
        formatter = createTextFormatter(false);
        break;
      default:
        // Fallback to JSON format
        console.warn(`Unknown file format "${format}", using JSON format`);
        formatter = createJsonFormatter();
    }

    const transport = new DailyRotateFile({
      level: config.level || 'debug',
      dirname: config.directory,
      filename: config.filename,
      datePattern: config.datePattern || 'YYYY-MM-DD',
      maxSize: config.maxSize || '20m',
      maxFiles: config.maxFiles || '14d',
      format: formatter,
      zippedArchive: config.compress !== false,
    });

    return transport as any;
  } catch (error) {
    const errorMsg = `Failed to create rotating file transport: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

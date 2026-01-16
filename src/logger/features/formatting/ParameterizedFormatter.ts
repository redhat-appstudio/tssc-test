/**
 * Parameterized Formatter - Log4j 2.x style placeholder support
 *
 * Supports three logging styles:
 *
 * 1. Parameterized (log4j-style):
 *    logger.info("User {} logged in from {}", username, ipAddress);
 *
 * 2. Structured (current Winston style):
 *    logger.info('User logged in', { username, ipAddress });
 *
 * 3. Mixed (placeholders + metadata):
 *    logger.info("Processing {} items from {}", count, source, { batchId, timestamp });
 */

import { IMessageFormatter } from './IMessageFormatter';

/**
 * Check if a value is a plain object (for metadata detection)
 */
function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Check if it's a plain object (not Date, Array, Error, etc.)
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Safely serialize a parameter to string, handling circular references,
 * BigInt values, and Error objects without crashing.
 *
 * @param value - The value to serialize
 * @returns String representation of the value
 */
function serializeParam(value: any): string {
  if (value === null || value === undefined) return 'null';
  
  // Handle BigInt explicitly (JSON.stringify throws on BigInt)
  if (typeof value === 'bigint') return value.toString();
  
  // Handle Error objects with stack trace preservation
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  
  // Handle objects with circular-safe serialization
  if (typeof value === 'object') {
    try {
      const seen = new WeakSet();
      return JSON.stringify(value, (_key, val) => {
        // Handle BigInt in nested objects
        if (typeof val === 'bigint') return val.toString();
        
        // Detect circular references
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        return val;
      });
    } catch {
      // Fallback for any unexpected serialization errors
      return `[Unserializable ${value.constructor?.name || 'Object'}]`;
    }
  }
  
  return String(value);
}

/**
 * Parameterized Formatter Implementation
 *
 * Replaces {} placeholders in messages with parameters
 * while maintaining backward compatibility with structured logging.
 */
export class ParameterizedFormatter implements IMessageFormatter {
  /**
   * Format message with {} placeholders replaced by parameters
   *
   * @param message - Message template with {} placeholders
   * @param params - Parameters to replace placeholders
   * @returns Object with formatted message and remaining metadata
   */
  format(message: string, params: any[]): { message: string; metadata?: object } {
    // Count placeholders in message
    const placeholderCount = (message.match(/\{\}/g) || []).length;

    if (placeholderCount === 0) {
      // No placeholders - treat first param as metadata if it's an object
      if (params.length === 1 && isPlainObject(params[0])) {
        return { message, metadata: params[0] };
      }
      return { message };
    }

    // Extract parameters for placeholders and potential metadata
    const replacementParams = params.slice(0, placeholderCount);
    const lastParam = params[placeholderCount];
    const metadata = lastParam && isPlainObject(lastParam) ? lastParam : undefined;

    // Replace placeholders with parameters
    let formattedMessage = message;
    let paramIndex = 0;

    formattedMessage = formattedMessage.replace(/\{\}/g, () => {
      if (paramIndex < replacementParams.length) {
        const value = replacementParams[paramIndex++];
        return serializeParam(value);
      }
      return '{}'; // Leave placeholder if not enough params
    });

    return { message: formattedMessage, metadata };
  }
}

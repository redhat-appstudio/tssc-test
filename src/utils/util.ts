/**
 * Generates a random string of alphabetic characters with the specified length
 * @param length The length of the random string (default: 8)
 * @returns Random alphabetic string
 */
export function randomString(length: number = 8): string {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
}

/**
 * Generates a random string of alphanumeric characters with the specified length
 * @param length The length of the random string (default: 8)
 * @returns Random alphanumeric string
 */
export function randomAlphanumeric(length: number = 8): string {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }
  return result;
}

/**
 * Helper method to wait for a specified duration
 * @param ms - The number of milliseconds to wait
 * @returns A promise that resolves after the specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Result interface for retry operations
 */
export interface RetryOperationResult<T> {
  success: boolean;
  result: T | null;
  message?: string;
}

/**
 * Generic retry operation utility that can be used across different parts of the application
 *
 * This function will attempt to execute the provided operation function multiple times until
 * it either succeeds, hits the maximum number of retries, or encounters an unhandled error.
 *
 * @param operation - Function that performs the actual operation and returns a RetryOperationResult
 * @param maxRetries - Maximum number of retry attempts (defaults to 5)
 * @param retryDelayMs - Delay between retry attempts in milliseconds (defaults to 3000ms)
 * @param resourceIdentifier - Description of the resource being operated on (for logging)
 * @returns The result of the operation if successful, or null if all retries failed
 * @throws Error if an unhandled exception occurs during the operation
 */
export async function retryOperation<T>(
  operation: () => Promise<RetryOperationResult<T>>,
  maxRetries: number = 5,
  retryDelayMs: number = 3000,
  resourceIdentifier: string
): Promise<T | null> {
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const { success, result, message } = await operation();

      if (success) {
        const itemCount = Array.isArray(result) ? result.length : 1;
        console.log(`Successfully found ${itemCount} matching resources for ${resourceIdentifier}`);
        return result;
      }

      if (retryCount >= maxRetries) {
        console.log(`Max retries (${maxRetries}) reached: ${message}`);
        return null;
      }

      retryCount++;
      console.log(`${message}. Retrying (${retryCount}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    } catch (error) {
      throw new Error(`Failed to retrieve resource for ${resourceIdentifier}: ${error}`);
    }
  }

  return null;
}

/**
 * Extracts content from text using a regular expression
 *
 * @param content - The text content to search in
 * @param pattern - Regular expression pattern to search for
 * @param captureGroup - Capture group index to return (0 for full match, 1+ for specific groups)
 * @returns Array of matches or null if no matches found
 */
export function extractContentByRegex(
  content: string,
  pattern: RegExp,
  captureGroup: number = 0
): string[] | null {
  // Reset the regex in case it was used before (important for regex with 'g' flag)
  pattern.lastIndex = 0;

  const matches: string[] = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    if (match[captureGroup] !== undefined) {
      matches.push(match[captureGroup]);
    }
  }

  return matches.length > 0 ? matches : null;
}

/**
 * Extracts and parses YAML content from text using a regular expression
 *
 * @param content - The text content to search in
 * @param pattern - Regular expression pattern to search for YAML blocks
 * @returns Array of parsed YAML objects or null if no matches or parsing fails
 */
export async function extractYamlByRegex(content: string, pattern: RegExp): Promise<any[] | null> {
  try {
    // Dynamic import of yaml package
    const yaml = await import('yaml');

    // Get YAML content blocks
    const yamlBlocks = extractContentByRegex(content, pattern);

    if (!yamlBlocks) {
      return null;
    }

    // Parse each YAML block
    const parsedYaml = yamlBlocks
      .map(block => {
        try {
          return yaml.parse(block);
        } catch (err) {
          console.warn(`Failed to parse YAML block: ${err}`);
          return null;
        }
      })
      .filter(block => block !== null);

    return parsedYaml.length > 0 ? parsedYaml : null;
  } catch (err) {
    console.error(`Error extracting YAML content: ${err}`);
    return null;
  }
}

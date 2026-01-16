/**
 * Message Formatter Interface
 *
 * Defines the contract for message formatting strategies.
 * Implementations can support different formatting styles:
 * - Log4j-style parameterized logging (e.g., "User {} logged in", username)
 * - Structured logging (e.g., "User logged in", { username })
 * - Mixed style (e.g., "User {} logged in", username, { timestamp })
 */

export interface IMessageFormatter {
  /**
   * Format a message with parameters
   *
   * @param message - Message template (may contain placeholders)
   * @param params - Parameters to format into the message
   * @returns Object with formatted message and optional metadata
   */
  format(message: string, params: any[]): {
    message: string;
    metadata?: object;
  };
}

/**
 * Command interface for implementing the Command pattern
 * All commands should implement this interface
 */
export interface Command {
  /**
   * Executes the command
   * @returns A promise that resolves when the command is complete
   */
  execute(): Promise<void>;
}

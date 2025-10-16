/**
 * Base client interface that all API clients should implement
 * This provides a consistent structure across all API clients
 */
export interface IBaseApiClient {
  /**
   * Check if the client is properly initialized and connected
   */
  isConnected(): Promise<boolean>;

  /**
   * Ping the service to check connectivity
   */
  ping(): Promise<boolean>;
}

/**
 * Base client class with common functionality
 * All API clients should extend this for consistency
 */
export abstract class BaseApiClient implements IBaseApiClient {
  protected readonly baseUrl: string;
  protected readonly timeout: number;

  constructor(baseUrl: string, timeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Default implementation for connectivity check
   * Subclasses can override for specific behavior
   */
  public async isConnected(): Promise<boolean> {
    try {
      return await this.ping();
    } catch {
      return false;
    }
  }

  /**
   * Abstract method that must be implemented by subclasses
   */
  public abstract ping(): Promise<boolean>;

  /**
   * Common error handling method
   */
  protected handleError(operation: string, error: any): never {
    const message = `Failed to ${operation}: ${error.message || error}`;
    console.error(message, error);
    throw new Error(message);
  }

  /**
   * Common retry logic wrapper
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }
}

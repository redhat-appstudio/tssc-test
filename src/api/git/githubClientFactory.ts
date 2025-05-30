import { GithubClient, GithubClientOptions } from './githubClient';

/**
 * Singleton factory to manage GitHub clients
 * This ensures we reuse authentication and clients across different parts of the application
 */
export class GitHubClientFactory {
  private static instance: GitHubClientFactory;
  private clients: Map<string, GithubClient> = new Map();
  private tokens: Map<string, string> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance of the factory
   */
  public static getInstance(): GitHubClientFactory {
    if (!GitHubClientFactory.instance) {
      GitHubClientFactory.instance = new GitHubClientFactory();
    }
    return GitHubClientFactory.instance;
  }

  /**
   * Get a GitHub client, creating it if necessary
   *
   * @param options Client configuration options
   * @returns A GitHub client instance
   */
  public getClient(options: GithubClientOptions): GithubClient {
    const key = this.getClientKey(options);

    if (!this.clients.has(key)) {
      this.clients.set(key, new GithubClient(options));
    }

    return this.clients.get(key)!;
  }

  /**
   * Get a GitHub client using a token and optional base URL
   *
   * @param token GitHub API token
   * @param baseUrl Optional API base URL
   * @returns A GitHub client instance
   */
  public getClientByToken(token: string, baseUrl?: string): GithubClient {
    return this.getClient({ token, baseUrl });
  }

  /**
   * Store a GitHub token for a specific component
   * This allows other parts of the application to access the token without re-fetching it
   *
   * @param componentName The component associated with this token
   * @param token The GitHub API token
   */
  public registerToken(componentName: string, token: string): void {
    this.tokens.set(componentName, token);
  }

  /**
   * Get a GitHub token for a specific component
   *
   * @param componentName The component name
   * @returns The GitHub API token or undefined if not found
   */
  public getTokenForComponent(componentName: string): string | undefined {
    return this.tokens.get(componentName);
  }

  /**
   * Generate a unique key for caching clients based on options
   *
   * @param options GitHub client options
   * @returns A unique cache key
   */
  private getClientKey(options: GithubClientOptions): string {
    return `${options.token}:${options.baseUrl || 'default'}`;
  }

  /**
   * Clear all cached clients and tokens
   * Mainly used for testing
   */
  public clearCache(): void {
    this.clients.clear();
    this.tokens.clear();
  }
}

/**
 * Convenience function to get the GitHub client factory instance
 */
export function getGitHubClientFactory(): GitHubClientFactory {
  return GitHubClientFactory.getInstance();
}

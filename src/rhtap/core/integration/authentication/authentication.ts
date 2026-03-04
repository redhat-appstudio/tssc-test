import { KubeClient } from '../../../../../src/api/ocp/kubeClient';
import { IntegrationSecret } from '../../integrationSecret';
import { LoggerFactory, Logger } from '../../../../logger/logger';

/**
 * Authentication (Trustification) singleton class
 * Provides access to the Authentication integration secret
 */
export class Authentication implements IntegrationSecret {
  private static instance: Authentication | null = null;
  private readonly logger: Logger;
  private kubeClient: KubeClient;
  private secret: Record<string, string> = {};

  private constructor(kubeClient: KubeClient) {
    this.logger = LoggerFactory.getLogger('rhtap.core.integration.authentication');
    this.kubeClient = kubeClient;
  }

  /**
   * Retrieve integration secrets from Kubernetes
   * @returns Promise resolving to the secret data
   */
  public async getIntegrationSecret(): Promise<Record<string, string>> {
    return this.secret;
  }

  /**
   * Loads GitHub integration secrets from Kubernetes
   * @returns Promise with the secret data
   */
  private async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-authentication-integration', 'tssc');
    if (!secret) {
      throw new Error(
        'Authentication integration secret tssc-authentication-integration not found in the cluster. Please ensure the secret exists.'
      );
    }
    return secret;
  }

  /**
   * Creates and initializes the Authentication singleton instance
   * @param kubeClient KubeClient instance required for API calls
   * @returns Promise resolving to the initialized Authentication singleton instance
   */
  public static async initialize(kubeClient: KubeClient): Promise<Authentication> {
    if (!Authentication.instance) {
      Authentication.instance = new Authentication(kubeClient);
      try {
          // Get secrets from Kubernetes
          Authentication.instance.secret = await Authentication.instance.loadSecret();
      } catch (error) {
          Authentication.instance.logger.error(`Failed to initialize Authentication: ${error}`);
          throw error;
      }
    }
    return Authentication.instance;
  }

  public getOidc_issuer_url(): string {
    return this.secret.oidc_issuer_url;
  }

  public getOidc_client_id(): string {
    return this.secret.oidc_client_id;
  }

  public getOidc_client_secret(): string {
    return this.secret.oidc_client_secret;
  }

  /**
   * For testing purposes only - allows resetting the singleton
   */
  public static reset(): void {
    Authentication.instance = null;
  }
}

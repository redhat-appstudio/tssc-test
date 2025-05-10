import { KubeClient } from '../../../../../src/api/ocp/kubeClient';
import { SBOMResult, TPAClient } from '../../../../../src/api/tpa/tpaClient';
import { IntegrationSecret } from '../../integrationSecret';

/**
 * TPA (Trustification) singleton class
 * Provides access to TPA functionality including SBOM search
 */
export class TPA implements IntegrationSecret {
  private static instance: TPA | null = null;
  private tpaClient: TPAClient | null = null;
  private initialized = false;
  private kubeClient: KubeClient;
  private secret: Record<string, string> = {};

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(kubeClient: KubeClient) {
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
    const secret = await this.kubeClient.getSecret('rhtap-trustification-integration', 'rhtap');
    if (!secret) {
      throw new Error(
        'Trustification integration secret rhtap-trustification-integration not found in the cluster. Please ensure the secret exists.'
      );
    }
    return secret;
  }

  /**
   * Creates and initializes the TPA singleton instance
   * @param kubeClient KubeClient instance required for API calls
   * @returns Promise resolving to the initialized TPA singleton instance
   */
  public static async initialize(kubeClient: KubeClient): Promise<TPA> {
    if (!TPA.instance) {
      TPA.instance = new TPA(kubeClient);
      await TPA.instance.initClient();
    }
    return TPA.instance;
  }

  /**
   * Initializes the TPA client
   */
  private async initClient(): Promise<void> {
    if (!this.initialized) {
      try {
        // Get secrets from Kubernetes
        this.secret = await this.loadSecret();

        // Initialize TPA client with secrets
        this.tpaClient = new TPAClient(
          this.secret.bombastic_api_url,
          this.secret.oidc_issuer_url,
          this.secret.oidc_client_id,
          this.secret.oidc_client_secret
        );

        await this.tpaClient.initAccessToken();
        this.initialized = true;
      } catch (error) {
        console.error('Failed to initialize TPA client:', error);
        throw error;
      }
    }
  }

  public getBombastic_api_url(): string {
    return this.secret.bombastic_api_url;
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

  public getSupported_cyclonedx_version(): string {
    return this.secret.supported_cyclonedx_version;
  }

  /**
   * Searches for SBOM files by name
   * @param name The name to search for
   * @param retries Number of retries before giving up (default: 10)
   * @returns A promise that resolves to an array of SBOM results
   */
  public async searchSBOM(name: string, retries = 10): Promise<SBOMResult[]> {
    console.log(`Searching for SBOM with name: ${name}`);

    if (!this.initialized) {
      await this.initClient();
    }
    if (!this.tpaClient) {
      throw new Error('TPA client is not initialized');
    }

    try {
      const results = await this.tpaClient.findSBOMsByName(name, retries);
      console.log(`Found ${results.length} SBOM results for: ${name}`);
      return results;
    } catch (error) {
      console.log({ err: error }, `Failed to search for SBOM: ${name}`);
      throw error;
    }
  }

  /**
   * For testing purposes only - allows resetting the singleton
   */
  public static reset(): void {
    TPA.instance = null;
  }
}

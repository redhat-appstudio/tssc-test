import { KubeClient } from '../../../../../src/api/ocp/kubeClient';
import { SBOMResult, TPAClient } from '../../../../../src/api/tpa/tpaClient';
import { IntegrationSecret } from '../../integrationSecret';
import { LoggerFactory } from '../../../../logger/factory/loggerFactory';
import { Logger } from '../../../../logger/logger';

/**
 * TPA (Trustification) singleton class
 * Provides access to TPA functionality including SBOM search
 */
export class TPA implements IntegrationSecret {
  private static instance: TPA | null = null;
  private readonly logger: Logger;
  private tpaClient: TPAClient | null = null;
  private initialized = false;
  private kubeClient: KubeClient;
  private secret: Record<string, string> = {};

  private constructor(kubeClient: KubeClient) {
    this.logger = LoggerFactory.getLogger('rhtap.core.integration.tpa');
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
    const secret = await this.kubeClient.getSecret('tssc-trustification-integration', 'tssc');
    if (!secret) {
      throw new Error(
        'Trustification integration secret tssc-trustification-integration not found in the cluster. Please ensure the secret exists.'
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
        this.tpaClient = new TPAClient({
          bombasticApiUrl: this.secret.bombastic_api_url,
          oidcIssuerUrl: this.secret.oidc_issuer_url,
          oidcClientId: this.secret.oidc_client_id,
          oidcClientSecret: this.secret.oidc_client_secret
        });

        await this.tpaClient.initAccessToken();
        this.initialized = true;
      } catch (error) {
        this.logger.error('Failed to initialize TPA client:', error);
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
   * Searches for SBOM files by name, it doesn't work because of bug https://issues.redhat.com/browse/TC-2564. The alternative is to use searchSBOMBySha256
   * @param name The name to search for
   * @returns A promise that resolves to an array of SBOM results
   */
  public async searchSBOMByName(name: string): Promise<SBOMResult[]> {
    this.logger.info('Searching for SBOM with name: {}', name);

    if (!this.initialized) {
      await this.initClient();
    }
    if (!this.tpaClient) {
      throw new Error('TPA client is not initialized');
    }

    try {
      const results = await this.tpaClient.findSBOMsByName(name);
      this.logger.info(`Found ${results.length} SBOM results for: ${name}`);
      return results;
    } catch (error) {
      this.logger.error('Failed to search for SBOM: {}. Error: {}', name, error);
      throw error;
    }
  }

  /**
   * Searches for SBOM files by SHA256 hash
   * @param sha256 SHA-256 hash of the SBOM to search for
   * Searches for SBOM files by SHA-256 hash
   * @returns A promise that resolves to the SBOM result or null if not found
   * @throws Error if the TPA client is not initialized or if the search fails
   */
  public async searchSBOMBySha256(sha256: string): Promise<SBOMResult | null> {
    this.logger.info(`Searching for SBOM with SHA: ${sha256}`);
    if (!this.initialized) {
      await this.initClient();
    }
    if (!this.tpaClient) {
      throw new Error('TPA client is not initialized');
    }
    try {
      const result = await this.tpaClient.findSBOMBySha256(sha256);
      return result;
    } catch (error) {
      this.logger.error('Failed to get SBOM by SHA: {}. Error: {}', sha256, error);
      throw error;
    }
  }

  /**
   * Searches for SBOM files by name and document ID
   * @param name Name of the SBOM to search for
   * @param documentId Document ID of the SBOM to search for
   * @returns A promise that resolves to the SBOM result or null if not found
   * @throws Error if the TPA client is not initialized or if the search fails
   */
  public async searchSBOMByNameAndDocID(name: string, documentId: string): Promise<SBOMResult | null> {
    this.logger.info(`Searching for SBOM with name ${name} and document ID ${documentId}`);
    if (!this.initialized) {
      await this.initClient();
    }
    if (!this.tpaClient) {
      throw new Error('TPA client is not initialized');
    }
    try {
      const result = await this.tpaClient.findSBOMsByNameAndDocID(name, documentId);
      return result;
    } catch (error) {
      this.logger.error('Failed to get SBOM by document ID: {}. Error: {}', documentId, error);
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

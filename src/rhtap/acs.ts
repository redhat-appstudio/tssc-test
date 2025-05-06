import { KubeClient } from '../api/ocp/kubeClient';

export class ACS {
  private static instance: ACS | null = null;
  private kubeClient: KubeClient;
  private secret: Record<string, string> | null = null;
  private initialized = false;

  private constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
  }

  /**
   * Creates and initializes the ACS singleton instance
   * @param kubeClient KubeClient instance required for API calls
   * @returns Promise resolving to the initialized ACS singleton instance
   */
  public static async initialize(kubeClient: KubeClient): Promise<ACS> {
    if (!ACS.instance) {
      ACS.instance = new ACS(kubeClient);
    }

    if (!ACS.instance.initialized) {
      await ACS.instance.loadSecrets();
    }

    return ACS.instance;
  }

  /**
   * Gets the singleton instance of ACS
   * @returns ACS singleton instance or throws if not initialized
   */
  public static getInstance(): ACS {
    if (!ACS.instance || !ACS.instance.initialized) {
      throw new Error('ACS not initialized. Call ACS.initialize(kubeClient) first');
    }
    return ACS.instance;
  }

  /**
   * Loads the secrets required by ACS
   */
  private async loadSecrets(): Promise<void> {
    this.secret = await this.kubeClient.getSecret('rhtap-acs-integration', 'rhtap');
  }

  /**
   * Gets the ROX Central endpoint URL
   * @returns Promise resolving to the endpoint URL
   */
  public getRoxCentralEndpoint(): string {
    if (!this.secret) {
      throw new Error('ACS not properly initialized');
    }
    return this.secret.endpoint;
  }

  /**
   * Gets the authentication token for ACS
   * @returns Promise resolving to the token string
   */
  public async getToken(): Promise<string> {
    if (!this.secret) {
      throw new Error('ACS not properly initialized');
    }
    return this.secret.token;
  }

  /**
   * For testing purposes only - allows resetting the singleton
   */
  public static reset(): void {
    ACS.instance = null;
  }
}

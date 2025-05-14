import { KubeClient } from '../../../api/ocp/kubeClient';

export class TAS {
  private static instance: TAS | null = null;
  private kubeClient: KubeClient;
  private secret: Record<string, string> | null = null;
  private initialized = false;

  private constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
  }

  /**
   * Creates and initializes the TAS singleton instance
   * @param kubeClient KubeClient instance required for API calls
   * @returns Promise resolving to the initialized TAS singleton instance
   */
  public static async initialize(kubeClient: KubeClient): Promise<TAS> {
    if (!TAS.instance) {
      TAS.instance = new TAS(kubeClient);
    }

    if (!TAS.instance.initialized) {
      await TAS.instance.loadSecrets();
      TAS.instance.initialized = true;
    }

    return TAS.instance;
  }

  /**
   * Gets the singleton instance of TAS
   * @returns TAS singleton instance or throws if not initialized
   */
  public static getInstance(): TAS {
    if (!TAS.instance || !TAS.instance.initialized) {
      throw new Error('TAS not initialized. Call TAS.initialize(kubeClient) first');
    }
    return TAS.instance;
  }

  /**
   * Loads the secrets required by TAS
   */
  private async loadSecrets(): Promise<void> {
    this.secret = await this.kubeClient.getSecret('rhtap-tas-integration', 'tssc');
  }

  /**
   * Gets the TUF mirror URL
   * @returns Promise resolving to the TUF mirror URL
   */
  public getTufMirrorURL(): string {
    if (!this.secret) {
      throw new Error('TAS not properly initialized');
    }
    return this.secret.tuf_url;
  }

  /**
   * Gets the Rekor server URL
   * @returns Promise resolving to the Rekor server URL
   */
  public getRokorServerURL(): string {
    if (!this.secret) {
      throw new Error('TAS not properly initialized');
    }
    return this.secret.rekor_url;
  }

  /**
   * For testing purposes only - allows resetting the singleton
   */
  public static reset(): void {
    TAS.instance = null;
  }
}

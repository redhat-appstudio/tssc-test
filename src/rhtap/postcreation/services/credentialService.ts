import { KubeClient } from '../../../api/ocp/kubeClient';
import { base64Encode } from '../../../utils/util';

/**
 * Service for managing credentials and secrets across the application
 * Centralizes credential retrieval and encoding logic
 */
export class CredentialService {
  private static instance: CredentialService | null = null;
  private kubeClient: KubeClient;

  private constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
  }

  /**
   * Gets or creates the CredentialService instance
   * @param kubeClient KubeClient instance
   * @returns CredentialService singleton instance
   */
  public static getInstance(kubeClient: KubeClient): CredentialService {
    if (!CredentialService.instance) {
      CredentialService.instance = new CredentialService(kubeClient);
    }
    return CredentialService.instance;
  }

  /**
   * Retrieves the Cosign public key from Kubernetes secrets
   * @returns The Cosign public key as a string
   */
  public async getCosignPublicKey(): Promise<string> {
    return base64Encode(await this.kubeClient.getCosignPublicKey());
  }

  /**
   * Retrieves and encodes the Cosign private key
   * @returns Base64 encoded Cosign private key
   */
  public async getEncodedCosignPrivateKey(): Promise<string> {
    return base64Encode(await this.kubeClient.getCosignPrivateKey());
  }

  /**
   * Retrieves and encodes the Cosign private key password
   * @returns Base64 encoded password for the Cosign private key
   */
  public async getEncodedCosignPrivateKeyPassword(): Promise<string> {
    return base64Encode(await this.kubeClient.getCosignPrivateKeyPassword());
  }
}

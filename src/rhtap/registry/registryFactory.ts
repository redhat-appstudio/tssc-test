import { KubeClient } from '../../api/ocp/kubeClient';
import { loadFromEnv } from '../../utils/util';
import { ImageRegistry, ImageRegistryType } from './imageRegistry';
import { ArtifactoryRegistry } from './providers/artifactoryRegistry';
import { NexusRegistry } from './providers/nexusRegistry';
import { QuayRegistry } from './providers/quayRegistry';

/**
 * RegistryFactory using dependency injection pattern
 * This allows for easier testing and decouples the factory from secret retrieval
 * Implemented as a singleton to ensure efficient resource usage
 */
export class RegistryFactory {
  private readonly kubeClient: KubeClient;
  private static instance: RegistryFactory | null = null;

  /**
   * Create a new RegistryFactory with the provided KubeClient instance
   * Private constructor to enforce singleton pattern
   */
  private constructor(kubeClient: KubeClient) {
    this.kubeClient = kubeClient;
  }

  /**
   * Get the singleton instance of RegistryFactory
   * Creates a new instance with the provided KubeClient if none exists
   */
  public static getInstance(kubeClient?: KubeClient): RegistryFactory {
    if (!this.instance) {
      this.instance = new RegistryFactory(kubeClient || new KubeClient());
    }
    return this.instance;
  }

  /**
   * Reset the singleton instance - useful for testing
   */
  public static resetInstance(): void {
    this.instance = null;
  }

  /**
   * Create an appropriate registry based on the ImageRegistryType
   */
  public async createRegistry(
    imageRegistryType: ImageRegistryType,
    // orgName: string,
    imageName: string
  ): Promise<ImageRegistry> {
    const imageOrg = loadFromEnv('IMAGE_REGISTRY_ORG');
    switch (imageRegistryType) {
      case ImageRegistryType.QUAY:
      case ImageRegistryType.QUAYIO:
        const quayRegistry = new QuayRegistry(imageOrg, imageName);
        quayRegistry.setKubeClient(this.kubeClient);
        await quayRegistry.initialize();
        return quayRegistry;
      case ImageRegistryType.ARTIFACTORY:
        const artifactoryRegistry = new ArtifactoryRegistry(imageOrg, imageName);
        artifactoryRegistry.setKubeClient(this.kubeClient);
        await artifactoryRegistry.initialize();
        return artifactoryRegistry;
      case ImageRegistryType.NEXUS:
        const nexusRegistry = new NexusRegistry(imageOrg, imageName);
        nexusRegistry.setKubeClient(this.kubeClient);
        await nexusRegistry.initialize();
        return nexusRegistry;
      default:
        throw new Error(`Unsupported registry type: ${imageRegistryType}`);
    }
  }
}

/**
 * Convenience function to create a registry
 * Uses the singleton instance of RegistryFactory
 */
export async function createRegistry(
  imageRegistryType: ImageRegistryType,
  imageName: string,
  kubeClient?: KubeClient
): Promise<ImageRegistry> {
  // Use existing instance or create a new one with the provided kubeClient
  const factory = RegistryFactory.getInstance(kubeClient);
  return factory.createRegistry(imageRegistryType, imageName);
}

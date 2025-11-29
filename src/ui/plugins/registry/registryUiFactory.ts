/**
 * Registry UI Plugin Factory
 * 
 * Factory class for creating UI-specific Registry provider implementations.
 * Handles instantiation of the appropriate UI plugin based on Registry provider type.
 */

import { ImageRegistry, ImageRegistryType } from '../../../rhtap/core/integration/registry/imageRegistry';
import { RegistryPlugin } from './registryPlugin';
import { QuayUiPlugin } from './quayUiPlugin';
import { NexusUiPlugin } from './nexusUiPlugin';

export class RegistryUiFactory {
    /**
     * Creates a Registry UI plugin instance based on the Registry type.
     * 
     * @param registryType - The type of Registry provider (Quay, Nexus, Artifactory)
     * @param registry - The core Registry provider instance to wrap
     * @returns A Promise resolving to the appropriate RegistryPlugin instance
     * @throws Error if the Registry type is not supported
     */ 
    static async createRegistryPlugin(
        registryType: ImageRegistryType,
        registry: ImageRegistry
    ): Promise<RegistryPlugin | undefined> {
        switch (registryType) {
            case ImageRegistryType.QUAY:
                return new QuayUiPlugin(registry);
            case ImageRegistryType.NEXUS:
                return new NexusUiPlugin(registry);
            default:
                console.warn(`Unsupported Registry type: ${registryType}`);
                return undefined;
        }
    }
}

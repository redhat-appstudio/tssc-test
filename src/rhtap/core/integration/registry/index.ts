/**
 * Registry integration index file
 * Exports all registry-related functionality for easier imports throughout the application
 */

// Export the image registry interface
export * from './imageRegistry';

// Export registry providers
export * from './providers/quayRegistry';
export * from './providers/artifactoryRegistry';
export * from './providers/nexusRegistry';

// Export the registry factory
export * from './registryFactory';

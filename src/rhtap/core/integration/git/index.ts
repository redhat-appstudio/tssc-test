/**
 * Git integration index file
 * Exports all Git-related functionality for easier imports throughout the application
 */

// Export the Git interface and models
export * from './gitInterface';
export * from './models';

// Export the base Git provider
export * from './baseGitProvider';

// Export the Git providers
export * from './providers/github';
export * from './providers/bitbucket';
export * from './providers/gitlab';

// Export the factory
export * from './gitFactory';

// Export the template factory
export * from './templates/templateFactory';

// Export content modification types
export type { ContentModification, ContentModifications } from '../../../modification/contentModification';
export { ContentModificationsContainer } from '../../../modification/contentModification';

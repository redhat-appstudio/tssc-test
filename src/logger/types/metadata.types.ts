/**
 * Simplified logger metadata types
 * Auto-injects: projectName, worker (from test context) + timestamp (from Winston formatter)
 */

// Import and re-export TestContext for convenience
import { TestContext } from '../context/types';
export type { TestContext };

/**
 * Simplified logger metadata - auto-injected fields
 * - projectName: From test context (testInfo.project.name, e.g., 'e2e-go[github-tekton-quay-remote]')
 * - worker: Worker/parallel index (e.g., 0, 1, 2...)
 * - timestamp: Automatic via Winston formatter (not stored in metadata)
 */
export type LoggerMetadata = Partial<TestContext> & Record<string, any>;

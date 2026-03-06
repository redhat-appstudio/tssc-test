/**
 * Auto-injected test context - projectName and worker ID
 * - projectName: From testInfo.project.name (e.g., 'e2e-go[github-tekton-quay-remote]')
 * - worker: Worker/parallel index (e.g., 0, 1, 2...)
 * Note: timestamp is added automatically by Winston formatter
 */
export interface TestContext {
  projectName?: string; // e.g., 'e2e-go[github-tekton-quay-remote]'
  worker?: number; // e.g., 0, 1, 2
}

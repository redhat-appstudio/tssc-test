/**
 * Azure DevOps REST API Versions
 * @see https://learn.microsoft.com/en-us/rest/api/azure/devops/
 */
export const AZURE_API_VERSIONS = {
  /**
   * Default stable API version for most endpoints
   * Used by: Pipelines, Build, Variable Groups, Service Endpoints, Agent Queues, Projects
   */
  DEFAULT: '7.1',

  /**
   * Pipeline Permissions API (Preview)
   * Required for authorizing pipelines to use resources like variable groups and agent pools
   * @see https://learn.microsoft.com/en-us/rest/api/azure/devops/approvalsandchecks/pipeline-permissions
   */
  PIPELINE_PERMISSIONS: '7.1-preview.1',
} as const;

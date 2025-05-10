import { TektonClient } from '../../../../../../src/api/ci/tektonClient';
import { KubeClient } from '../../../../../../src/api/ocp/kubeClient';
import { RetryOperationResult, retryOperation } from '../../../../../utils/util';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import { CIType, EventType, Pipeline, PipelineStatus } from '../ciInterface';
import { PipelineRunKind } from '@janus-idp/shared-react/index';

const CI_NAMESPACE = 'rhtap-app-ci';

export class TektonCI extends BaseCI {
  private tektonClient: TektonClient;
  private componentName: string;

  constructor(componentName: string, kubeclient: KubeClient) {
    super(CIType.TEKTON, kubeclient);
    this.componentName = componentName;
    this.tektonClient = new TektonClient(this.kubeClient);
  }

  /**
   * Get a pipeline for the given pull request based on specified filters
   * Aligns with CI interface; retrieves the latest pipeline run that matches
   * the criteria sorted by creation timestamp
   *
   * @param pullRequest The pull request to get the pipeline for
   * @param pipelineStatus The status of the pipeline to filter by
   * @param eventType Optional event type to filter by (defaults to PULL_REQUEST for Tekton)
   * @returns Promise<Pipeline | null> A standardized Pipeline object or null if not found
   */
  public async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    // Validate required parameters
    if (!pullRequest.repository) {
      console.error('Repository information is missing in the pull request');
      return null;
    }

    // Set default event type for Tekton if not provided
    const effectiveEventType = eventType || EventType.PULL_REQUEST;
    const gitRepository = pullRequest.repository;

    console.log(
      `Finding pipeline runs for repository: ${gitRepository}, event type: ${effectiveEventType}`
    );

    // Define the pipeline retrieval operation that will be retried
    const findPipelineOperation = async (): Promise<RetryOperationResult<Pipeline>> => {
      try {
        // Get all pipeline runs for this repository
        const allPipelineRuns = await this.tektonClient.getPipelineRunsByGitRepository(
          CI_NAMESPACE,
          gitRepository
        );

        if (!allPipelineRuns || allPipelineRuns.length === 0) {
          return {
            success: false,
            result: null,
            message: `No pipeline runs found for repository: ${gitRepository}`,
          };
        }

        // Filter pipeline runs by the event type label and pipeline status
        const filteredPipelineRuns = allPipelineRuns.filter(pipelineRun => {
          const labels = pipelineRun.metadata?.labels || {};
          return (
            labels['pipelinesascode.tekton.dev/event-type'] === effectiveEventType &&
            this.mapTektonStatusToPipelineStatus(pipelineRun) === pipelineStatus
          );
        });

        if (filteredPipelineRuns.length === 0) {
          return {
            success: false,
            result: null,
            message: `No matching pipeline runs found for event type: ${effectiveEventType} with status: ${pipelineStatus}`,
          };
        }

        console.log(`Found ${filteredPipelineRuns.length} matching pipeline runs`);

        // Sort pipeline runs by creation timestamp to get the latest one
        const sortedPipelineRuns = [...filteredPipelineRuns].sort((a, b) => {
          const timeA = a.metadata?.creationTimestamp
            ? new Date(a.metadata.creationTimestamp).getTime()
            : 0;
          const timeB = b.metadata?.creationTimestamp
            ? new Date(b.metadata.creationTimestamp).getTime()
            : 0;
          return timeB - timeA; // Descending order (latest first)
        });

        // Get the latest pipeline run
        const latestPipelineRun = sortedPipelineRuns[0];
        if (!latestPipelineRun) {
          return {
            success: false,
            result: null,
            message: 'No pipeline runs available after sorting',
          };
        }

        console.log(`Using latest pipeline run: ${latestPipelineRun.metadata?.name}`);

        // Extract relevant data from the pipeline run
        const name = latestPipelineRun.metadata?.name || '';
        const results = latestPipelineRun.status?.results
          ? JSON.stringify(latestPipelineRun.status.results)
          : '';

        // Get URL if available from the log-url annotation
        const url =
          latestPipelineRun.metadata?.annotations?.['pipelinesascode.tekton.dev/log-url'] || '';

        // Map Tekton specific statuses to standardized values
        let status = this.mapTektonStatusToPipelineStatus(latestPipelineRun);

        // Create pipeline using factory method
        const pipeline = Pipeline.createTektonPipeline(
          name,
          status,
          gitRepository,
          '', // logs not available yet
          results,
          url,
          pullRequest.sha
        );

        return {
          success: true,
          result: pipeline,
        };
      } catch (error) {
        console.error('Error fetching pipeline runs:', error);
        return {
          success: false,
          result: null,
          message: `Error fetching pipeline runs: ${error}`,
        };
      }
    };

    // Execute the operation with retries
    try {
      // Retry up to 10 times with a 5-second delay between attempts
      return await retryOperation(
        findPipelineOperation,
        10, // maxRetries
        5000, // retryDelayMs
        `pipeline for repository ${gitRepository} with status ${pipelineStatus}`
      );
    } catch (error) {
      console.error(`Failed to get pipeline after retries:`, error);
      return null;
    }
  }

  /**
   * Maps Tekton pipeline run status to standardized PipelineStatus
   * Extracted to a separate method for reuse and readability
   */
  private mapTektonStatusToPipelineStatus(pipelineRun: PipelineRunKind): PipelineStatus {
    const condition = pipelineRun.status?.conditions?.[0];
    if (!condition) {
      return PipelineStatus.UNKNOWN;
    }

    const condStatus = condition.status;
    const type = condition.type;
    const reason = condition.reason;

    if (condStatus === 'True' && type === 'Succeeded') {
      return PipelineStatus.SUCCESS;
    } else if (condStatus === 'False' && type === 'Succeeded') {
      return PipelineStatus.FAILURE;
    } else if (condStatus === 'Unknown') {
      if (reason === 'Running' || reason === 'Started') {
        return PipelineStatus.RUNNING;
      } else if (reason === 'Pending') {
        return PipelineStatus.PENDING;
      }
    }

    return PipelineStatus.UNKNOWN;
  }

  /**
   * Implementation of abstract method from BaseCI
   * Returns a standardized pipeline status value compatible with all CI systems
   */
  protected async checkPipelineStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    if (!pipeline.name) {
      throw new Error('Pipeline name is required for Tekton pipelines');
    }

    try {
      // Try to get the pipeline run up to 3 times with a 2-second delay between attempts
      let pipelineRun = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (!pipelineRun && attempts < maxAttempts) {
        pipelineRun = await this.tektonClient.getPipelineRunByName(CI_NAMESPACE, pipeline.name);

        if (!pipelineRun) {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(
              `PipelineRun ${pipeline.name} not found, retrying (${attempts}/${maxAttempts})...`
            );
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
          }
        }
      }

      if (!pipelineRun) {
        console.warn(`PipelineRun ${pipeline.name} not found after ${maxAttempts} attempts`);
        return PipelineStatus.UNKNOWN;
      }

      // Extract the primary condition from the PipelineRun
      const condition = pipelineRun.status?.conditions?.[0];
      if (!condition) {
        return PipelineStatus.UNKNOWN;
      }

      // Get the status, type and reason
      const status = condition.status;
      const type = condition.type;
      const reason = condition.reason;

      console.log(
        `PipelineRun ${pipeline.name} status: ${status}, type: ${type}, reason: ${reason}`
      );

      // Map Tekton specific statuses to standardized values
      if (status === 'True' && type === 'Succeeded') {
        return PipelineStatus.SUCCESS;
      } else if (status === 'False' && type === 'Succeeded') {
        return PipelineStatus.FAILURE;
      } else if (status === 'Unknown') {
        if (reason === 'Running' || reason === 'Started') {
          return PipelineStatus.RUNNING;
        } else if (reason === 'Pending') {
          return PipelineStatus.PENDING;
        }
      }
      // Default to unknown if no mapping is found
      return PipelineStatus.UNKNOWN;
    } catch (error) {
      console.error(`Error checking pipeline status for ${pipeline.name}:`, error);
      throw new Error(`Failed to check pipeline status: ${error}`);
    }
  }

  /**
   * Waits for all PipelineRuns associated with the component to finish processing
   *
   * This method identifies all pipeline runs for the current component that are still
   * in progress (not marked with "pipelinesascode.tekton.dev/state=completed"), and
   * waits for each of them to reach a terminal state (success or failure).
   *
   * The method:
   * 1. Queries for all pipeline runs associated with the component repository
   * 2. Filters those that don't have the "completed" state label
   * 3. Continues polling until all pipelines reach completion
   *
   * @returns Promise<void> Resolves when all pipelines have reached a terminal state
   * @throws Logs but does not throw errors to prevent process termination
   */
  public async waitForAllPipelinesToFinish(): Promise<void> {
    try {
      const sourceRepoName = this.componentName;
      const maxAttempts = 20;
      const pollIntervalMs = 20000; // Poll every 20 seconds

      // Define the operation to check for running pipelines
      const checkPipelines = async () => {
        // Get all pipeline runs for the component
        const allPipelineRuns = await this.tektonClient.getPipelineRunsByGitRepository(
          CI_NAMESPACE,
          sourceRepoName
        );

        // Filter pipeline runs by checking the label "pipelinesascode.tekton.dev/state"
        const runningPipelineRuns =
          allPipelineRuns?.filter(pr => {
            const state = pr.metadata?.labels?.['pipelinesascode.tekton.dev/state'];
            const name = pr.metadata?.name || 'unknown';
            if (state !== 'completed') {
              console.log(`PipelineRun ${name} still running, state: ${state || 'undefined'}`);
              return true;
            }
            return false;
          }) || [];

        console.log(`Found ${runningPipelineRuns.length} running pipeline run(s)`);

        // Return success only when no running pipelines are found
        return {
          success: runningPipelineRuns.length === 0,
          result: runningPipelineRuns.length === 0 ? true : null,
          message: `Waiting for ${runningPipelineRuns.length} pipeline(s) to complete`,
        };
      };

      // Run the operation with retries
      const result = await retryOperation(
        checkPipelines,
        maxAttempts,
        pollIntervalMs,
        `pipelines for ${sourceRepoName}`
      );

      if (result) {
        console.log('All pipelines have finished processing.');
      } else {
        console.log(
          `Timeout reached. Some pipeline(s) still running after ${maxAttempts} attempts.`
        );
      }
    } catch (error) {
      console.error('Error waiting for all pipelines to finish:', error);
      throw new Error(`Failed to wait for pipelines: ${error}`);
    }
  }

  public async getWebhookUrl(): Promise<string> {
    const tektonWebhookUrl = await this.kubeClient.getOpenshiftRoute(
      'pipelines-as-code-controller',
      'openshift-pipelines'
    );
    return `https://${tektonWebhookUrl}`;
  }
}

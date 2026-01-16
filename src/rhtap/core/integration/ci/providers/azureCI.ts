import { AzureClient } from '../../../../../api/azure';
import {
  AzureBuild,
  AzurePipelineDefinition,
  AzurePipelineRun,
  AzurePipelineRunResult,
  AzurePipelineRunStatus,
  AzurePipelineTriggerReason,
  ServiceEndpoint,
} from '../../../../../api/azure/types/azure.types';
import { KubeClient } from '../../../../../api/ocp/kubeClient';
import { PullRequest } from '../../git/models';
import { BaseCI } from '../baseCI';
import {
  CIType,
  EventType,
  Pipeline,
  PipelineStatus,
  CancelPipelineOptions,
  CancelResult,
  MutableCancelResult,
  MutablePipelineCancelDetail,
  MutableCancelError,
} from '../ciInterface';
import retry from 'async-retry';

export interface Variable {
  key: string;
  value: string;
  isSecret: boolean;
}

export class AzureCI extends BaseCI {
  private azureClient!: AzureClient;
  private componentName: string;
  private secret!: Record<string, string>;
  private projectName: string;

  constructor(componentName: string, projectName: string, kubeClient: KubeClient) {
    super(CIType.AZURE, kubeClient);
    this.componentName = componentName;
    this.projectName = projectName;
  }

  private async loadSecret(): Promise<Record<string, string>> {
    const secret = await this.kubeClient.getSecret('tssc-azure-integration', 'tssc');
    if (!secret) {
      throw new Error('Azure secret not found in the cluster. Please ensure the secret exists.');
    }
    this.secret = secret;
    return secret;
  }

  public getHost(): string {
    if (!this.secret.host) {
      throw new Error('Azure host not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.host;
  }

  public getOrganization(): string {
    if (!this.secret.organization) {
      throw new Error(
        'Azure organization not found in the secret. Please ensure the secret exists.'
      );
    }
    return this.secret.organization;
  }

  public getToken(): string {
    if (!this.secret.token) {
      throw new Error('Azure token not found in the secret. Please ensure the secret exists.');
    }
    return this.secret.token;
  }

  public async getIntegrationSecret(): Promise<Record<string, string>> {
    await this.loadSecret();
    return this.secret;
  }

  public getWebhookUrl(): Promise<string> {
    throw new Error('Method not implemented.');
  }

  private async initAzureClient(): Promise<void> {
    try {
      await this.loadSecret();
      this.azureClient = new AzureClient({
        host: this.getHost(),
        organization: this.getOrganization(),
        project: this.projectName,
        pat: this.getToken(),
      });

      this.logger.info('Azure client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Azure client:', error);
      throw error;
    }
  }

  /**
   * Initialize the Azure client using credentials from cluster
   */
  public async initialize(): Promise<void> {
    try {
      await this.loadSecret();
      await this.initAzureClient();
      this.logger.info('Azure client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Azure client:', error);
      throw error;
    }
  }

  private mapAzureStatusToPipelineStatus(azureRun: AzurePipelineRun): PipelineStatus {
    if (!azureRun) return PipelineStatus.UNKNOWN;

    switch (azureRun.state) {
      case AzurePipelineRunStatus.NOT_STARTED:
      case AzurePipelineRunStatus.POSTPONED:
        return PipelineStatus.PENDING;
      case AzurePipelineRunStatus.IN_PROGRESS:
      case AzurePipelineRunStatus.CANCELLING:
        return PipelineStatus.RUNNING;
      case AzurePipelineRunStatus.COMPLETED:
        switch (azureRun.result) {
          case AzurePipelineRunResult.SUCCEEDED:
            return PipelineStatus.SUCCESS;
          case AzurePipelineRunResult.PARTIALLY_SUCCEEDED:
            return PipelineStatus.SUCCESS;
          case AzurePipelineRunResult.FAILED:
            return PipelineStatus.FAILURE;
          case AzurePipelineRunResult.CANCELED:
            return PipelineStatus.CANCELLED;
          default:
            return PipelineStatus.UNKNOWN;
        }
      default:
        return PipelineStatus.UNKNOWN;
    }
  }

  private mapAzureBuildStatusToPipelineStatus(azureBuild: AzureBuild): PipelineStatus {
    if (!azureBuild) return PipelineStatus.UNKNOWN;

    switch (azureBuild.status) {
      case 'succeeded':
        return PipelineStatus.SUCCESS;
      case 'failed':
        return PipelineStatus.FAILURE;
      case 'inProgress':
        return PipelineStatus.RUNNING;
      case 'notStarted':
        return PipelineStatus.PENDING;
      case 'stopped':
        return PipelineStatus.CANCELLED;
      default:
        return PipelineStatus.UNKNOWN;
    }
  }

  private convertAzureBuildToPipeline(
    azureBuild: AzureBuild,
    pipelineDef: AzurePipelineDefinition
  ): Pipeline {
    const pipelineInstance = new Pipeline(
      pipelineDef.id.toString(),
      this.ciType,
      pipelineDef.repository?.name || this.componentName,
      this.mapAzureBuildStatusToPipelineStatus(azureBuild)
    );

    pipelineInstance.name = `${pipelineDef.id}-${azureBuild.id}`;
    pipelineInstance.buildNumber = azureBuild.id;
    pipelineInstance.url = azureBuild.url;
    pipelineInstance.startTime = azureBuild.startTime ? new Date(azureBuild.startTime) : undefined;
    pipelineInstance.endTime = azureBuild.finishTime ? new Date(azureBuild.finishTime) : undefined;
    pipelineInstance.sha = (azureBuild as AzureBuild).sourceGetVersion;

    return pipelineInstance;
  }

  public async getPipeline(
    pullRequest: PullRequest,
    pipelineStatus?: PipelineStatus,
    eventType?: EventType
  ): Promise<Pipeline | null> {
    try {
      const pipelineDefSource = await this.azureClient.pipelines.getPipelineDefinition(this.componentName);
      const pipelineDefGitops = await this.azureClient.pipelines.getPipelineDefinition(
        this.componentName + '-gitops'
      );
      if (!pipelineDefSource || !pipelineDefGitops) {
        return null;
      }

      this.logger.info(
        `Retrieving pipelineruns for pipelines with id: ${pipelineDefSource.id} and ${pipelineDefGitops.id}`
      );

      const runsSource: AzurePipelineRun[] = await this.azureClient.pipelines.listPipelineRuns(
        pipelineDefSource.id
      );
      const runsGitops: AzurePipelineRun[] = await this.azureClient.pipelines.listPipelineRuns(
        pipelineDefGitops.id
      );
      let runs = [...runsSource, ...runsGitops];

      // 0 is for dummy pull request
      if (pullRequest.pullNumber != 0) {
        this.logger.info(
          `Filtering runs for pull request ${pullRequest.pullNumber} with sha ${pullRequest.sha}`
        );
        runs = runs.filter(
          run => run.variables?.['system.pullRequest.sourceCommitId']?.value === pullRequest.sha
        );
      }

      let builds: AzureBuild[] = await Promise.all(
        runs.map(run => this.azureClient.pipelines.getBuild(run.id))
      );

      if (eventType == EventType.PULL_REQUEST) {
        // PR Automated shows in the azure pipeline api response as manual build
        builds = builds.filter(run => run.reason === AzurePipelineTriggerReason.PULL_REQUEST);
      } else if (eventType == EventType.PUSH) {
        //TODO: remove this later, for debugging purpose
        this.logger.info(`Azure builds: ${JSON.stringify(builds, null, 2)}`);
        builds = builds.filter(run => run.reason === AzurePipelineTriggerReason.INDIVIDUAL_CI);
      }

      const shaKey = eventType === EventType.PULL_REQUEST ? 'pr.sourceSha' : 'ci.sourceSha';
      
      const targetBuild = builds.find(run => run.triggerInfo?.[shaKey] === pullRequest.sha);
      this.logger.info(`Retrieved build ${JSON.stringify(targetBuild)}`);

      if (!targetBuild) {
        return null;
      }

      const isFromSourcePipeline = runsSource.some(run => run.id === targetBuild.id);
      const pipelineDefToUse = isFromSourcePipeline ? pipelineDefSource : pipelineDefGitops;

      const pipeline = this.convertAzureBuildToPipeline(targetBuild, pipelineDefToUse);

      if (pipelineStatus !== undefined && pipeline.status !== pipelineStatus) {
        return null;
      }

      return pipeline;
    } catch (error) {
      this.logger.error('Error in getPipeline for {}: {}', this.componentName, error);
      return null;
    }
  }

  public async getPipelineLogs(pipeline: Pipeline): Promise<string> {
    const pipelineRun = await this.azureClient.pipelines.getPipelineRunLogs(
      Number(pipeline.id),
      pipeline.buildNumber!
    );
    return pipelineRun;
  }

  protected async checkPipelinerunStatus(pipeline: Pipeline): Promise<PipelineStatus> {
    const pipelineRun = await this.azureClient.pipelines.getPipelineRun(
      Number(pipeline.id),
      pipeline.buildNumber!
    );

    return this.mapAzureStatusToPipelineStatus(pipelineRun);
  }

  public override async getCIFilePathInRepo(): Promise<string> {
    return 'azure-pipelines.yml';
  }

  public async waitForAllPipelineRunsToFinish(): Promise<void> {
    await retry(
      async () => {
        this.logger.info(`Waiting for all pipelines to finish for component: ${this.componentName}`);
        const pipelineId = await this.azureClient.pipelines.getPipelineIdByName(this.componentName);
        if (!pipelineId) {
          return;
        }
        const pipelineRuns = await this.azureClient.pipelines.listPipelineRuns(pipelineId);

        if (
          pipelineRuns.filter(
            pipelineRun =>
              this.mapAzureStatusToPipelineStatus(pipelineRun) == PipelineStatus.PENDING ||
              this.mapAzureStatusToPipelineStatus(pipelineRun) == PipelineStatus.RUNNING
          ).length === 0
        ) {
          return;
        }
      },
      {
        retries: 40,
        minTimeout: 10000,
        maxTimeout: 30000,
      }
    );
  }

  public async createServiceEndpoint(
    serviceEndpointName: string,
    serviceEndpointType: string,
    gitHost: string,
    gitToken: string
  ): Promise<ServiceEndpoint> {
    try {
      const projectId = await this.azureClient.projects.getProjectIdByName(this.projectName);

      const serviceEndpoint = await this.azureClient.serviceEndpoints.createServiceEndpoint(
        serviceEndpointName,
        serviceEndpointType,
        gitHost,
        gitToken,
        projectId
      );

      return serviceEndpoint;
    } catch (error) {
      this.logger.error('Failed to create service endpoint \'{}\': {}', serviceEndpointName, error);
      throw error;
    }
  }

  public async createPipeline(
    pipelineName: string,
    repoId: string,
    repoType: string,
    serviceEndpoint: ServiceEndpoint,
    yamlPath: string
  ): Promise<unknown> {
    try {
      const pipelineDefinition = await this.azureClient.pipelines.createPipelineDefinition(
        pipelineName,
        repoId,
        repoType,
        yamlPath,
        serviceEndpoint.id
      );

      return pipelineDefinition;
    } catch (error) {
      this.logger.error('Failed to create Azure pipeline \'{}\': {}', pipelineName, error);
      throw error;
    }
  }

  public async deletePipeline(pipelineName: string): Promise<void> {
    try {
      const pipelineId = await this.azureClient.pipelines.getPipelineIdByName(pipelineName);
      if (!pipelineId) {
        this.logger.warn(`Pipeline with name '${pipelineName}' not found. Skipping deletion.`);
        return;
      }

      await this.azureClient.pipelines.deletePipeline(pipelineId);
      this.logger.info(`Successfully deleted pipeline '${pipelineName}' with ID: ${pipelineId}`);
    } catch (error) {
      this.logger.error('Failed to delete Azure pipeline \'{}\': {}', pipelineName, error);
      throw error;
    }
  }

  public async createVariableGroup(
    groupName: string,
    variables: Variable[],
    description?: string
  ): Promise<void> {
    const azureVariables: { [key: string]: { value: string; isSecret: boolean } } = {};
    for (const variable of variables) {
      azureVariables[variable.key] = {
        value: variable.value,
        isSecret: variable.isSecret,
      };
    }

    try {
      await this.azureClient.variableGroups.createVariableGroup(
        groupName,
        description || `Variable group for ${groupName}`,
        azureVariables
      );
    } catch (error) {
      this.logger.error('Failed to create or update variable group \'{}\': {}', groupName, error);
      throw error;
    }
  }

  public async deleteVariableGroup(groupName: string): Promise<void> {
    try {
      if (!this.azureClient) {
        await this.initialize();
      }

      const variableGroup = await this.azureClient.variableGroups.getVariableGroupByName(groupName);
      if (!variableGroup) {
        this.logger.warn(`Variable group with name '${groupName}' not found. Skipping deletion.`);
        return;
      }

      const projectId = await this.azureClient.projects.getProjectIdByName(this.projectName);
      await this.azureClient.variableGroups.deleteVariableGroup(variableGroup.id, projectId);
      this.logger.info(
        `Successfully deleted variable group '${groupName}' with ID: ${variableGroup.id}`
      );
    } catch (error) {
      this.logger.error('Failed to delete variable group \'{}\': {}', groupName, error);
      throw error;
    }
  }

  public async authorizePipelineForAgentPool(
    pipelineName: string,
    poolName: string
  ): Promise<unknown> {
    const pipelineId = await this.azureClient.pipelines.getPipelineIdByName(pipelineName);
    const agentQueueId = await this.azureClient.agentPools.getAgentQueueByName(poolName);
    return await this.azureClient.agentPools.authorizePipelineForAgentPool(pipelineId!, agentQueueId!.id);
  }

  public async authorizePipelineForVariableGroup(
    pipelineName: string,
    varGroupName: string
  ): Promise<unknown> {
    const pipelineId = await this.azureClient.pipelines.getPipelineIdByName(pipelineName);
    const variableGroup = await this.azureClient.variableGroups.getVariableGroupByName(varGroupName);
    return await this.azureClient.variableGroups.authorizePipelineForVariableGroup(pipelineId!, variableGroup!.id);
  }

  public async deleteServiceEndpoint(endpointName: string): Promise<void> {
    const endpoint = await this.azureClient.serviceEndpoints.getServiceEndpointByName(endpointName);
    const projectId = await this.azureClient.projects.getProjectIdByName(this.projectName);
    if (!endpoint) {
      this.logger.warn(`Service endpoint with name '${endpointName}' not found. Skipping deletion.`);
      return;
    }
    await this.azureClient.serviceEndpoints.deleteServiceEndpoint(endpoint.id, projectId);
  }



  /**
   * Cancel all pipelines for this component with optional filtering
   */
  public override async cancelAllPipelines(
    options?: CancelPipelineOptions
  ): Promise<CancelResult> {
    // 1. Normalize options with defaults
    const opts = this.normalizeOptions(options);

    // 2. Initialize result object
    const result: MutableCancelResult = {
      total: 0,
      cancelled: 0,
      failed: 0,
      skipped: 0,
      details: [],
      errors: [],
    };

    this.logger.info(`[Azure] Starting build cancellation for ${this.componentName}`);

    try {
      // 3. Fetch all builds from Azure API
      const allBuilds = await this.fetchAllBuilds();
      result.total = allBuilds.length;

      if (allBuilds.length === 0) {
        this.logger.info(`[Azure] No builds found for ${this.componentName}`);
        return result;
      }

      this.logger.info(`[Azure] Found ${allBuilds.length} total builds`);

      // 4. Apply filters
      const buildsToCancel = this.filterBuilds(allBuilds, opts);

      this.logger.info(`[Azure] ${buildsToCancel.length} builds match filters`);
      this.logger.info(`[Azure] ${allBuilds.length - buildsToCancel.length} builds filtered out`);

      // 5. Cancel builds in batches
      await this.cancelBuildsInBatches(buildsToCancel, opts, result);

      // 6. Validate result counts (accounting invariant)
      const accounted = result.cancelled + result.failed + result.skipped;
      if (accounted !== result.total) {
        const missing = result.total - accounted;
        this.logger.error(
          `❌ [Azure] ACCOUNTING ERROR: ${missing} builds unaccounted for ` +
          `(total: ${result.total}, accounted: ${accounted})`
        );

        // Add accounting error to errors array
        result.errors.push({
          pipelineId: 'ACCOUNTING_ERROR',
          message: `${missing} builds lost in processing`,
          error: new Error('Result count mismatch - this indicates a bug in the cancellation logic'),
        });
      }

      // 7. Log summary
      this.logger.info(`[Azure] Cancellation complete:`, {
        total: result.total,
        cancelled: result.cancelled,
        failed: result.failed,
        skipped: result.skipped,
      });

    } catch (error: any) {
      this.logger.error('[Azure] Error in cancelAllPipelines: {}', error);
      throw new Error(`Failed to cancel pipelines: {}`);
    }

    return result;
  }



  /**
   * Fetch all builds from Azure API
   */
  private async fetchAllBuilds(): Promise<AzureBuild[]> {
    try {
      // Get pipeline definitions for both source and gitops repos
      const pipelineDefSource = await this.azureClient.pipelines.getPipelineDefinition(this.componentName);
      const pipelineDefGitops = await this.azureClient.pipelines.getPipelineDefinition(
        this.componentName + '-gitops'
      );

      const builds: AzureBuild[] = [];

      // Fetch builds from source pipeline if it exists
      if (pipelineDefSource) {
        const runsSource = await this.azureClient.pipelines.listPipelineRuns(pipelineDefSource.id);
        const buildsSource = await Promise.all(
          runsSource.map(run => this.azureClient.pipelines.getBuild(run.id))
        );

        // Tag builds with their pipeline name for later cancellation logging
        const taggedSourceBuilds = buildsSource.map(build => ({
          ...build,
          _pipelineName: this.componentName
        }));
        builds.push(...taggedSourceBuilds);
      }

      // Fetch builds from gitops pipeline if it exists
      if (pipelineDefGitops) {
        const runsGitops = await this.azureClient.pipelines.listPipelineRuns(pipelineDefGitops.id);
        const buildsGitops = await Promise.all(
          runsGitops.map(run => this.azureClient.pipelines.getBuild(run.id))
        );

        // Tag builds with their pipeline name for later cancellation logging
        const taggedGitopsBuilds = buildsGitops.map(build => ({
          ...build,
          _pipelineName: `${this.componentName}-gitops`
        }));
        builds.push(...taggedGitopsBuilds);
      }

      return builds;

    } catch (error: any) {
      this.logger.error('[Azure] Failed to fetch builds: {}', error);
      throw error;
    }
  }

  /**
   * Filter builds based on cancellation options
   */
  private filterBuilds(
    builds: AzureBuild[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>
  ): AzureBuild[] {
    return builds.filter(build => {
      // Filter 1: Skip completed builds unless includeCompleted is true
      if (!options.includeCompleted && this.isCompletedStatus(build)) {
        this.logger.info(`[Filter] Skipping completed build ${build.id} (${build.status})`);
        return false;
      }

      // Filter 2: Check exclusion patterns
      if (this.matchesExclusionPattern(build, options.excludePatterns)) {
        this.logger.info(`[Filter] Excluding build ${build.id} by pattern`);
        return false;
      }

      // Filter 3: Filter by event type if specified
      if (options.eventType && !this.matchesEventType(build, options.eventType)) {
        this.logger.info(`[Filter] Skipping build ${build.id} (event type mismatch)`);
        return false;
      }

      // Note: Azure builds don't have branch information directly,
      // so we skip branch filtering for Azure
      if (options.branch) {
        this.logger.info(`[Filter] Branch filtering not supported for Azure DevOps, ignoring branch filter`);
      }

      return true; // Include this build for cancellation
    });
  }

  /**
   * Check if build status is completed
   */
  private isCompletedStatus(build: AzureBuild): boolean {
    const completedStatuses = ['succeeded', 'failed', 'stopped'];
    return completedStatuses.includes(build.status);
  }

  /**
   * Check if build matches any exclusion pattern
   */
  private matchesExclusionPattern(build: AzureBuild, patterns: ReadonlyArray<RegExp>): boolean {
    if (patterns.length === 0) {
      return false;
    }

    const buildName = build.buildNumber || `Build-${build.id}`;

    return patterns.some(pattern => pattern.test(buildName));
  }

  /**
   * Check if build matches the event type
   * Azure uses 'reason' field to indicate trigger type
   */
  private matchesEventType(build: AzureBuild, eventType: EventType): boolean {
    switch (eventType) {
      case EventType.PUSH:
        return build.reason === AzurePipelineTriggerReason.INDIVIDUAL_CI ||
               build.reason === AzurePipelineTriggerReason.BATCH_CI;
      case EventType.PULL_REQUEST:
        // PR Automated shows as manual build in Azure
        return build.reason === AzurePipelineTriggerReason.MANUAL ||
               build.reason === AzurePipelineTriggerReason.PULL_REQUEST;
      default:
        return false;
    }
  }

  /**
   * Cancel builds in batches with concurrency control
   */
  private async cancelBuildsInBatches(
    builds: AzureBuild[],
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Split into batches
    const batches = this.chunkArray(builds, options.concurrency);

    this.logger.info(`[Azure] Processing ${batches.length} batches with concurrency ${options.concurrency}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.logger.info(`[Azure] Processing batch ${i + 1}/${batches.length} (${batch.length} builds)`);

      // Create promises for all builds in this batch
      const promises = batch.map(build =>
        this.cancelSingleBuild(build, options, result)
      );

      // Wait for all in batch to complete (don't stop on errors)
      const batchResults = await Promise.allSettled(promises);

      // Inspect batch results for systemic failures
      const batchSuccesses = batchResults.filter(r => r.status === 'fulfilled').length;
      const batchFailures = batchResults.filter(r => r.status === 'rejected').length;

      this.logger.info(`[Azure] Batch ${i + 1}/${batches.length} complete: ${batchSuccesses} succeeded, ${batchFailures} rejected`);

      // Alert on complete batch failure - indicates systemic issue
      if (batchFailures === batch.length && batch.length > 0) {
        this.logger.error(`❌ [Azure] ENTIRE BATCH ${i + 1} FAILED - possible systemic issue (auth, network, or API problem)`);

        // Log first rejection reason for debugging
        const firstRejected = batchResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (firstRejected) {
          this.logger.error(`[Azure] First failure reason: ${firstRejected.reason}`);
        }
      }
    }
  }

  /**
   * Cancel a single build and update results
   */
  private async cancelSingleBuild(
    build: AzureBuild,
    options: Required<Omit<CancelPipelineOptions, 'eventType' | 'branch'>> & Pick<CancelPipelineOptions, 'eventType' | 'branch'>,
    result: MutableCancelResult
  ): Promise<void> {
    // Initialize detail object
    const detail: MutablePipelineCancelDetail = {
      pipelineId: build.id,
      name: build.buildNumber || `Build-${build.id}`,
      status: this.mapAzureBuildStatusToPipelineStatus(build),
      result: 'skipped',
      eventType: this.mapAzureEventType(build),
    };

    try {
      if (options.dryRun) {
        // Dry run mode - don't actually cancel
        detail.result = 'skipped';
        detail.reason = 'Dry run mode';
        result.skipped++;
        this.logger.info(`[DryRun] Would cancel build ${build.id}`);

      } else {
        // Extract pipeline name from tagged build (added in fetchAllBuilds)
        const pipelineName = (build as any)._pipelineName || this.componentName;

        // Actually cancel the build via Azure API
        await this.cancelBuildViaAPI(build.id);

        detail.result = 'cancelled';
        result.cancelled++;
        this.logger.info(`✅ [Azure] Cancelled build ${build.id} in ${pipelineName} (status: ${build.status})`);
      }

    } catch (error: any) {
      // Cancellation failed
      detail.result = 'failed';
      detail.reason = error.message;
      result.failed++;

      // Add to errors array
      const cancelError: MutableCancelError = {
        pipelineId: build.id,
        message: error.message,
        error: error,
      };

      // Add status code if available
      if (error.response?.status) {
        cancelError.statusCode = error.response.status;
      }

      // Add provider error code if available
      if (error.response?.data?.message) {
        cancelError.providerErrorCode = error.response.data.message;
      }

      result.errors.push(cancelError);

      this.logger.error('❌ [Azure] Failed to cancel build {}: {}', build.id, error);
    }

    // Add detail to results
    result.details.push(detail);
  }

  /**
   * Actually cancel the build via Azure API
   */
  private async cancelBuildViaAPI(buildId: number): Promise<void> {
    try {
      await this.azureClient.pipelines.cancelBuild(buildId);

    } catch (error: any) {
      // Re-throw - the azureClient.pipelines.cancelBuild already has detailed error handling
      throw error;
    }
  }

  /**
   * Map Azure build to EventType
   */
  private mapAzureEventType(build: AzureBuild): EventType | undefined {
    if (build.reason === AzurePipelineTriggerReason.INDIVIDUAL_CI ||
        build.reason === AzurePipelineTriggerReason.BATCH_CI) {
      return EventType.PUSH;
    }
    if (build.reason === AzurePipelineTriggerReason.MANUAL ||
        build.reason === AzurePipelineTriggerReason.PULL_REQUEST) {
      return EventType.PULL_REQUEST;
    }
    return undefined;
  }


}

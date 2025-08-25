import { TestItem } from '../../playwright/testItem';
import { ArgoCD, Environment } from '../../rhtap/core/integration/cd/argocd';
import { CI, CIType, PipelineStatus } from '../../rhtap/core/integration/ci';
import { Pipeline } from '../../rhtap/core/integration/ci/pipeline';
import { EventType } from '../../rhtap/core/integration/ci';
import { Git, PullRequest } from '../../rhtap/core/integration/git';
import { TPA } from '../../rhtap/core/integration/tpa';
import { SBOMResult } from '../../api/tpa/tpaClient';
import { sleep } from '../util';
import { expectPipelineSuccess } from './assertionHelpers';
import { expect } from '@playwright/test';
import retry from 'async-retry';

/**
 * Promotes an application to a specific environment using a pull request workflow
 *
 * This function implements a GitOps promotion workflow by:
 * 1. Creating a promotion pull request in the GitOps repository for the target environment
 * 2. Waiting for any CI validation pipelines triggered by the PR to complete successfully
 * 3. Merging the PR once validations pass, which triggers deployment
 * 4. Syncing the ArgoCD application to deploy the changes to the target environment
 * 5. Waiting for the application to be fully synced with the new configuration
 *
 * The function handles error cases and provides appropriate error messages when
 * any step in the process fails.
 *
 * @param git - Git provider instance for interacting with repositories
 * @param ci - CI provider instance for monitoring pipeline execution
 * @param cd - ArgoCD instance for managing deployments
 * @param environment - Target environment to promote to (e.g. 'dev', 'stage', 'prod')
 * @param image - The container image URL to deploy to the target environment
 * @returns Promise that resolves when promotion is complete
 * @throws Error if any step in the promotion process fails
 */
export async function promoteWithPRAndGetPipeline(
  git: Git,
  ci: CI,
  cd: ArgoCD,
  environment: Environment,
  image: string
): Promise<Pipeline> {
  console.log(`Promoting application to ${environment} environment with pull request...`);
  try {
    // Step 1: Check if target environment's application exists
    const application = await cd.getApplication(environment);
    expect(application).not.toBeNull();
    console.log(`Application exists in ${environment} environment`);

    // Step 2: Create a promotion PR
    console.log(`Creating promotion PR for ${environment} with image: ${image}`);
    const pr = await git.createPromotionPullRequestOnGitopsRepo(environment, image);
    console.log(`Created promotion PR #${pr.pullNumber} in ${git.getGitOpsRepoName()} repository`);

    // Step 3: Wait for pipeline triggered by the promotion PR to complete
    const pipeline = await getPipelineAndWaitForCompletion(
      ci,
      pr,
      EventType.PULL_REQUEST,
      `promotion PR #${pr.pullNumber} in ${pr.repository}`
    );

    // Step 4: Merge the PR when pipeline was successful
    const mergedPR = await git.mergePullRequest(pr);
    console.log(`Merged promotion PR #${mergedPR.pullNumber} with SHA: ${mergedPR.sha}`);

    // Step 5: Sync and wait for the application to be ready
    const syncResult = await runAndWaitforAppSync(cd, environment, mergedPR.sha);
    expect(syncResult).toBe(true);

    console.log(`Application successfully promoted to ${environment}`);

    return pipeline;
  } catch (error) {
    console.error(
      `Error promoting application to ${environment}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Promotes an application to a specific environment by directly committing changes to the gitops repository
 *
 * This function:
 * 1. Directly modifies and commits changes to the gitops repository without creating a PR
 * 2. Syncs the ArgoCD application for the environment
 * 3. Waits for the application to be fully synced
 *
 * Note: This bypasses any CI checks and review processes that would normally be enforced by PRs
 *
 * @param git Git provider instance
 * @param ci CI provider instance (used for CI status observation only)
 * @param cd ArgoCD instance
 * @param environment Target environment to promote to
 * @param image The container image URL to deploy
 * @returns Promise that resolves when promotion is complete
 */
export async function promoteWithoutPRAndGetPipeline(
  git: Git,
  ci: CI,
  cd: ArgoCD,
  environment: Environment,
  image: string
): Promise<Pipeline> {
  console.log(`Promoting application to ${environment} environment with direct commit...`);

  try {
    // Step 1: Check if target environment's application exists
    const application = await cd.getApplication(environment);
    expect(application).not.toBeNull();
    console.log(`Application exists in ${environment} environment`);

    // Step 2: Create a promotion commit to the gitops repository
    const commitSha = await git.createPromotionCommitOnGitOpsRepo(environment, image);
    console.log(`Created commit with SHA: ${commitSha}`);

    // Create a pull request object for pipeline reference only
    // Note: This is not an actual PR, just a reference object with the commit SHA
    const commitRef = new PullRequest(0, commitSha, git.getGitOpsRepoName());

    // Step 3: Wait for pipeline triggered by the promotion PR to complete
    const pipeline = await getPipelineAndWaitForCompletion(
      ci,
      commitRef,
      EventType.PUSH,
      `commit ${commitSha} on main branch in ${commitRef.repository}`
    );

    // Step 4: Sync and wait for the application to be ready
    const syncResult = await runAndWaitforAppSync(cd, environment, commitSha);
    expect(syncResult).toBe(true);

    console.log(`Application successfully promoted to ${environment}`);

    return pipeline;
  } catch (error) {
    console.error(
      `Error directly promoting application to ${environment}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

export async function runAndWaitforAppSync(
  cd: ArgoCD,
  environment: Environment,
  commitSha: string
): Promise<boolean> {
  try{
    // Sync and wait for the application to be ready
    console.log(`Syncing application in ${environment} environment`);
    await cd.syncApplication(environment);

    console.log(`Waiting for application to sync in ${environment} environment...`);
    const syncResult = await cd.waitUntilApplicationIsSynced(environment, commitSha);
    if (!syncResult.synced) {
      throw new Error(`Failed to sync application. Status: ${syncResult.status}. Reason: ${syncResult.message}`);
    }
    console.log(`Application successfully synced to ${environment}: ${syncResult.message}`);
    return syncResult.synced;
  } catch (error) {
    console.error(
      `Error syncing and waiting for application to sync to ${environment} with commitSha ${commitSha}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Helper function to get pipeline and wait for completion with consistent error handling
 * @param ci CI provider instance
 * @param reference Pull request or commit reference
 * @param eventType Event type (PULL_REQUEST or PUSH)
 * @param operationDescription Description for logging
 * @returns Promise<Pipeline> The completed pipeline
 */
export async function getPipelineAndWaitForCompletion(
  ci: CI,
  prReference: PullRequest,
  eventType: EventType,
  operationDescription: string
): Promise<Pipeline> {
  const ciType = ci.getCIType();

  try{
    console.log(`🔍 Getting ${ciType} pipeline for ${operationDescription}...`);
    const pipeline = await retry(
      async () => {
        const p = await ci.getPipeline(prReference, PipelineStatus.RUNNING, eventType);
        if (!p) {
          throw new Error('Pipeline not found or not yet running. Retrying...');
        }
        return p;
      },
      {
        retries: 5,
        minTimeout: 10000,
        maxTimeout: 30000,
        onRetry: (error: Error, attempt: number) => {
          console.error(`Attempt ${attempt} failed: ${error.message}`);
        },
      }
    );

    if (!pipeline) {
      console.error(`No ${ciType} pipeline was triggered by ${operationDescription}`);
      throw new Error('Expected a pipeline to be triggered but none was found');
    }

    console.log(`Pipeline ${pipeline.getDisplayName()} was triggered by ${operationDescription}`);

    const pipelineStatus = await ci.waitForPipelineToFinish(pipeline);
    console.log(`${ciType} pipeline completed with status: ${pipelineStatus}`);

    await expectPipelineSuccess(pipeline, ci);
    console.log(`${ciType} pipeline ${pipeline.getDisplayName()} was successful`);

    return pipeline;
  } catch (error) {
    console.error(
      `Error waiting for pipeline: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

export function getTestItemFromEnv(): TestItem {
  const raw = process.env.TESTITEM;
  if (!raw) {
    throw new Error('TESTITEM environment variable is not set');
  }
  try {
    const obj = JSON.parse(raw);
    return new TestItem(
      obj.name,
      obj.template,
      obj.registryType,
      obj.gitType,
      obj.ciType,
      obj.tpa,
      obj.acs
    );
  } catch (e) {
    throw new Error(`Failed to parse TESTITEM: ${e}`);
  }
}

/**
 * Handles source repository code changes and manages pipeline execution based on CI provider type.
 *
 * This function implements different workflows depending on the CI system:
 * - For Jenkins: Creates a direct commit to the main branch and monitors the resulting pipeline
 * - For Tekton: Creates a pull request, waits for the PR pipeline to complete, merges the PR,
 *   then waits for the push pipeline to complete
 *
 * @param git - The Git provider instance to interact with source repositories
 * @param ci - The CI provider instance to monitor pipeline execution
 * @returns Promise<void> - Resolves when the entire workflow completes
 * @throws Error - If any step in the process fails
 */
export async function handleSourceRepoCodeChanges(git: Git, ci: CI): Promise<void> {
  console.log(
    'Starting to make changes to source repo code and build application image through pipelines...'
  );
  const ciType = ci.getCIType();
  const gitType = git.getGitType();

  if (ciType === CIType.GITHUB_ACTIONS || ciType === CIType.JENKINS || ciType === CIType.AZURE) {
    console.log(`Using ${ciType} for ${gitType} repository`);
    // For GitHub Actions, we create a direct commit to the main branch
    return fastMovingToBuildApplicationImage(git, ci);
  } else {
    console.log(`Creating a pull request on source repo on ${gitType} repository ...`);
    // For other CI types, create a PR which triggers a pipeline
    await buildApplicationImageWithPR(git, ci);
  }
}

/**
 * Expedites application image building by committing direct code changes and bypassing
 * the pull request workflow.
 *
 * This function:
 * 1. Makes source code changes directly to the main branch
 * 2. Triggers CI/CD pipeline to build the application image
 * 3. Promotes the built image to the specified environment
 * 4. Verifies successful deployment of the new image
 *
 * Use this method for testing scenarios where you need a quick image build without
 * the overhead of code reviews and pull request workflows.
 *
 * @param git - Git provider instance for interacting with repositories
 * @param ci - CI provider instance for monitoring pipeline execution
 * @param cd - ArgoCD instance for managing deployments
 * @param environment - Target environment for deployment (e.g., 'dev', 'stage')
 * @param image - The container image tag/reference to use
 * @returns Promise that resolves when the image is built and deployed
 * @throws Error if the build or deployment process fails
 */
export async function fastMovingToBuildApplicationImage(git: Git, ci: CI): Promise<void> {
  const gitType = git.getGitType();
  try {
    console.log(`Creating a direct commit on source repo on ${gitType} repository ...`);

    // Step 1: Create a direct commit to the main branch
    const commitSha = await git.createSampleCommitOnSourceRepo();
    console.log(`Created commit with SHA: ${commitSha}`);
    await sleep(10000);

    // Create a pull request object for pipeline reference only
    // Note: This is not an actual PR, just a reference object with the commit SHA
    const commitRef = new PullRequest(0, commitSha, git.getSourceRepoName());

    // Step 2: Wait for pipeline to complete after commit
    await getPipelineAndWaitForCompletion(
      ci,
      commitRef,
      EventType.PUSH,
      `commit ${commitSha} on main branch in ${commitRef.repository}`
    );
  } catch (error) {
    console.error(
      `Error handling source repo code changes: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

export async function buildApplicationImageWithPR(git: Git, ci: CI): Promise<void> {
  const gitType = git.getGitType();
  try {
    console.log(`Creating a pull request on source repo on ${gitType} repository ...`);

    // Step 1: Create a PR which triggers a pipeline
    const pullRequest = await git.createSamplePullRequestOnSourceRepo();
    console.log(`Created PR ${pullRequest.url} with SHA: ${pullRequest.sha}`);

    // Step 2: Get the pipeline triggered by the PR and wait for complete
    await getPipelineAndWaitForCompletion(
      ci,
      pullRequest,
      EventType.PULL_REQUEST,
      `promotion PR #${pullRequest.pullNumber} in ${pullRequest.repository}`
    );

    // TODO: Uncomment the following line when mergePullRequest is implemented
    //Step 3: If PR pipeline is successful, merge it and wait for the push pipeline
    const mergedPR = await git.mergePullRequest(pullRequest);

    //Step 4: Wait for Pipeline to complete after merged PR
    await getPipelineAndWaitForCompletion(
      ci,
      mergedPR,
      EventType.PUSH,
      `on-push pipeline after merging #${mergedPR.pullNumber} in ${mergedPR.repository}`
    );
  } catch (error) {
    console.error(
      `Error handling source repo code changes: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

export async function handleInitialPipelineRuns(ci: CI): Promise<void> {
  if (ci.getCIType() === CIType.GITLABCI) {
    // Cancel initial GitLab CI pipelines triggered by the first commit.
    // Gitlabci pipelines takes longer than other CIs, canceling helps reduce total test duration.
    console.log('CI Provider is gitlabci - cancelling initial pipelines');
    await ci.cancelAllInitialPipelines();
  } else {
    // For other CI providers, wait for the initial pipelines to complete.
    console.log(`CI Provider is ${ci.getCIType()} - waiting for initial pipelines to finish`);
    await ci.waitForAllPipelineRunsToFinish();
  }
}

export async function handlePromotionToEnvironmentandGetPipeline(
  git: Git,
  ci: CI,
  cd: ArgoCD,
  environment: Environment,
  image: string
): Promise<Pipeline> {
  // If CI is Jenkins, promote with directly creating commit
  // Else, promote with creating PR
  if (ci.getCIType() === CIType.JENKINS) {
    return await promoteWithoutPRAndGetPipeline(git, ci, cd, environment, image);
  } else {
    return await promoteWithPRAndGetPipeline(git, ci, cd, environment, image);
  }
}

export async function getSbomIDFromCIPipelineLogs(ci: CI, pipeline: Pipeline): Promise<string> {
  try {
    console.log(`Getting ${ci.getCIType()} Pipeline ${pipeline.id} logs to find SBOM document ID`);
    const pipelineLogs = await ci.getPipelineLogs(pipeline);

    const documentIdMatch = pipelineLogs.match(/"document_id"\s*:\s*"([^"]+)"/);
    if (!documentIdMatch) {
      throw new Error('No document ID for SBOM found in pipeline logs');
    }

    // Get the value "document_id" from match string
    const documentId = documentIdMatch[1];
    console.log(`SBOM Document ID ${documentId} found from Promotion Pipeline ${pipeline.id} logs`);
    return documentId;
  } catch (error) {
    console.error(`Error getting pipeline Logs`, error);
    throw error;
  }
}

/**
 * Searches for SBOM in TPA portal using document ID list
 *
 * @param tpa TPA instance for searching
 * @param sbomName The name of SBOM to search for
 * @param documentIdList Array of document IDs to search for
 * @returns Promise<SBOMResult | null> The first SBOM found or null if none found
 * @throws Error if TPA search fails or no valid document IDs provided
 */
export async function searchSBOMByNameAndDocIdList(
  tpa: TPA,
  sbomName: string,
  documentIdList: string[],
): Promise<boolean> {
  // Validate input parameters
  if (!documentIdList || documentIdList.length === 0) {
    throw new Error('Document ID list cannot be empty');
  }

  if (!tpa) {
    throw new Error('TPA instance is not initialised');
  }

  const foundSbom: SBOMResult[] = [];
  const notFoundSbom: string[] = [];
  let sbom: SBOMResult | null = null;

  // Try to find SBOM using each document ID - search all for verification
  for (const documentId of documentIdList) {
    console.log(`Attempting to search with document ID: ${documentId}`);

    try {
      sbom = await tpa.searchSBOMByNameAndDocID(sbomName, documentId);
      if (!sbom) {
        notFoundSbom.push(documentId);
        continue;
      }
      foundSbom.push(sbom);
      console.log(`✅ SBOM found with document ID: ${documentId}`);
      console.log(`SBOM details: Name: ${sbom.name}, Published: ${sbom.published}, SHA256: ${sbom.sha256}`);

    } catch (error) {
      console.error(`❌ Error searching with document ID ${documentId}:`, error);
      throw error;
    }
  }
  if (notFoundSbom.length > 0) {
    console.error(`⚠️ Failed to find SBOM Document ID ${notFoundSbom} in TPA`);
    return false;
  }
  console.log (`✅ All SBOMS ${documentIdList} found in TPA!!!`);
  return true;
}

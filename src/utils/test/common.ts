import { TestItem } from '../../playwright/testItem';
import { ArgoCD, Environment } from '../../rhtap/cd/argocd';
import { CI, CIType } from '../../rhtap/ci';
import { EventType } from '../../rhtap/ci';
import { PipelineHandler } from '../../rhtap/ci/PipelineHandler';
import { Git } from '../../rhtap/git';
import { expect } from '@playwright/test';
import { PullRequest } from '../../rhtap/git/models';

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
export async function promoteToEnvironmentWithPR(
  git: Git,
  ci: CI,
  cd: ArgoCD,
  environment: Environment,
  image: string
): Promise<void> {
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
    const pipeline = await PipelineHandler.getPipelineFromPullRequest(
      pr,
      ci,
      EventType.PULL_REQUEST
    );
    if (!pipeline) {
      throw new Error('No pipeline was triggered by the promotion PR');
    }
    console.log(`Pipeline ${pipeline.getDisplayName()} was triggered by the promotion PR`);
    const pipelineStatus = await ci.waitForPipelineToFinish(pipeline);
    console.log(`Pipeline completed with status: ${pipelineStatus}`);
    expect(pipeline.isSuccessful()).toBe(true);
    
    // Step 4: Merge the PR when pipeline was successful
    const mergedPR = await git.mergePullRequest(pr);
    console.log(`Merged promotion PR #${mergedPR.pullNumber} with SHA: ${mergedPR.sha}`);

    // Step 5: Sync and wait for the application to be ready
    console.log(`Syncing application in ${environment} environment`);
    await cd.syncApplication(environment);
    
    console.log(`Waiting for application to sync in ${environment} environment...`);
    const syncResult = await cd.waitUntilApplicationIsSynced(environment, mergedPR.sha);
    if (!syncResult.synced) {
      throw new Error(`Failed to sync application: ${syncResult.message}`);
    }
    console.log(`Application successfully promoted to ${environment}: ${syncResult.message}`);
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
export async function promoteToEnvironmentWithoutPR(
  git: Git,
  cd: ArgoCD,
  environment: Environment,
  image: string
): Promise<void> {
  console.log(`Promoting application to ${environment} environment with direct commit...`);

  try {
    // Step 1: Check if target environment's application exists
    const application = await cd.getApplication(environment);
    expect(application).not.toBeNull();
    console.log(`Application exists in ${environment} environment`);

    // Step 2: Create a promotion commit to the gitops repository
    const commitSha = await git.createPromotionCommitOnGitOpsRepo(environment, image);
    console.log(`Created commit with SHA: ${commitSha}`);

    // Step 3: Sync and wait for the application to be ready
    console.log(`Syncing application in ${environment} environment...`);
    await cd.syncApplication(environment);

    console.log(`Waiting for application to sync in ${environment} environment...`);
    const syncResult = await cd.waitUntilApplicationIsSynced(environment, commitSha);

    if (!syncResult.synced) {
      throw new Error(`Failed to sync application: ${syncResult.message}`);
    }

    console.log(`Application successfully promoted to ${environment}: ${syncResult.message}`);
  } catch (error) {
    console.error(
      `Error directly promoting application to ${environment}: ${error instanceof Error ? error.message : String(error)}`
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
    return new TestItem(obj.template, obj.registryType, obj.gitType, obj.ciType, obj.tpa, obj.acs);
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
    const ciType = ci.getCIType();
    console.log(`Handling source repo code changes for ${ciType}...`);

    try {
      // Step 1: Make changes to the source repo based on CI type
      if (ciType === CIType.JENKINS) {
        // For Jenkins: Commit directly to the main branch
        console.log('Jenkins CI detected, committing changes directly to main branch...');
        const commitSha = await git.createSampleCommitOnSourceRepo();
        console.log(`Created commit with SHA: ${commitSha}`);

        // Create a pull request object for pipeline reference only
        // Note: This is not an actual PR, just a reference object with the commit SHA
        const commitRef = new PullRequest(0, commitSha, git.getSourceRepoName());

        // Get the pipeline triggered by the commit
        console.log(`Getting Jenkins pipeline for commit: ${commitSha}`);
        const pipeline = await PipelineHandler.getPipelineFromPullRequest(commitRef, ci);
        expect(pipeline).not.toBeNull();

        // console.log(`Waiting for Jenkins pipeline ${pipeline.getDisplayName()} to finish...`);
        if (!pipeline) {
          console.warn('No Jenkins pipeline was triggered by the commit');
          return;
        }
        const pipelineStatus = await ci.waitForPipelineToFinish(pipeline);
        console.log(`Jenkins pipeline completed with status: ${pipelineStatus}`);
        expect(pipelineStatus).toBe('success');
      } else if (ciType === CIType.TEKTON) {
        // For Tekton: Follow PR-based workflow
        console.log('Tekton CI detected, creating a pull request on source repo...');
        // Step 1: Create a PR which triggers a pipeline
        const pullRequest = await git.createSamplePullRequestOnSourceRepo();
        console.log(`Created PR #${pullRequest.pullNumber} with SHA: ${pullRequest.sha}`);

        // Step 2: Get the pipeline triggered by the PR
        console.log('Getting Tekton pipeline for PR event...');
        const pipeline = await PipelineHandler.getPipelineFromPullRequest(
          pullRequest,
          ci,
          EventType.PULL_REQUEST
        );

        if (!pipeline) {
          console.warn('No Tekton pipeline was triggered by the pull request');
          throw new Error('Expected a pipeline to be triggered but none was found');
        }

        // Step 3: Wait for the PR pipeline to complete
        console.log(`Waiting for Tekton PR pipeline ${pipeline.getDisplayName()} to finish...`);
        const pipelineStatus = await ci.waitForPipelineToFinish(pipeline);
        console.log(`Tekton PR pipeline completed with status: ${pipelineStatus}`);

        // Step 4: If PR pipeline is successful, merge it and wait for the push pipeline
        expect(pipeline.isSuccessful()).toBe(true);
        console.log(
          `Tekton PR pipeline was successful. Merging pull request #${pullRequest.pullNumber}...`
        );

        // TODO: Uncomment the following line when mergePullRequest is implemented
        await git.mergePullRequest(pullRequest);

        // Step 5: Wait for the push pipeline triggered by the merge
        console.log('Getting push pipeline...');
        const pushPipeline = await PipelineHandler.getPipelineFromPullRequest(
          pullRequest,
          ci,
          EventType.PUSH
        );

        if (pushPipeline) {
          console.log(`Waiting for push pipeline ${pushPipeline.getDisplayName()} to finish...`);
          const pushStatus = await ci.waitForPipelineToFinish(pushPipeline);
          console.log(`Push pipeline completed with status: ${pushStatus}`);

          if (!pushPipeline.isSuccessful()) {
            console.warn(`Push pipeline failed with status: ${pushPipeline.status}`);
          }
        } else {
          console.warn('No push pipeline was triggered after merging the PR');
        }
      } else {
        console.log(`Unsupported CI type: ${ciType}, skipping code changes workflow`);
      }
    } catch (error) {
      console.error(
        `Error handling source repo code changes: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
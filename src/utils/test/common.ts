import { TestItem } from '../../playwright/testItem';
import { ArgoCD, Environment } from '../../rhtap/cd/argocd';
import { CI } from '../../rhtap/ci';
import { EventType } from '../../rhtap/ci';
import { PipelineHandler } from '../../rhtap/ci/PipelineHandler';
import { Git } from '../../rhtap/git';
import { expect } from '@playwright/test';

/**
 * Promotes an application to a specific environment using a pull request
 *
 * This function:
 * 1. Creates a promotion PR to move an image to the target environment
 * 2. Waits for any CI pipelines triggered by the PR to complete
 * 3. Merges the PR if the pipeline was successful
 * 4. Syncs the ArgoCD application for the environment
 * 5. Waits for the application to be fully synced
 *
 * @param git Git provider instance
 * @param ci CI provider instance
 * @param cd ArgoCD instance
 * @param environment Target environment to promote to
 * @param image The container image URL to deploy (optional - if not provided, current image will be used)
 * @returns Promise that resolves when promotion is complete
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
    if (pipeline) {
      console.log(`Pipeline ${pipeline.getDisplayName()} was triggered by the promotion PR`);
      const pipelineStatus = await ci.waitForPipelineToFinish(pipeline);
      console.log(`Pipeline completed with status: ${pipelineStatus}`);
      expect(pipeline.isSuccessful()).toBe(true);
    } else {
      throw new Error('No pipeline was triggered by the promotion PR');
    }
    // Step 4: Merge the PR if pipeline was successful
    await git.mergePullRequest(pr);
    console.log(`Merged promotion PR #${pr.pullNumber}`);
    // const mergePipeline = await PipelineHandler.getPipelineFromPullRequest(pr, ci, EventType.PUSH);
    // if (mergePipeline) {
    //   console.log(`Waiting for pipeline ${mergePipeline.getDisplayName()} to finish...`);
    //   const mergePipelineStatus = await ci.waitForPipelineToFinish(mergePipeline);
    //   expect(mergePipelineStatus).toBe('success');
    // } else {
    //   throw new Error('No pipeline was triggered by the merge PR');
    // }
    // console.log(`Merged PR #${pr.pullNumber} into ${git.getGitOpsRepoName()} repository`);

    // Step 5: Sync and wait for the development application to be ready
    console.log(`Syncing application in ${environment} environment`);

    await cd.syncApplication(environment);
    //TODO: do we need to confirm the commit sha?
    const commitSha = await git.getGitOpsRepoCommitSha();
    const syncResult = await cd.waitUntilApplicationIsSynced(environment, commitSha);
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

    // Step 2: // Step 2: Create a promotion commit to the gitops repository
    const commitSha = await git.createPromotionCommitOnGitOpsRepo(environment, image);
    console.log(`Created commit with SHA: ${commitSha}`);

    // Step 3: Sync and wait for the application to be ready
    // console.log(`Syncing application in ${environment} environment...`);
    // await cd.syncApplication(environment);

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

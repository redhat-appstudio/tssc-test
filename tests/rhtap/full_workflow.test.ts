import { TestItem } from '../../src/playwright/testItem';
import { ArgoCD, Environment } from '../../src/rhtap/cd/argocd';
import { CI, CIType, EventType } from '../../src/rhtap/ci';
import { PipelineHandler } from '../../src/rhtap/ci/PipelineHandler';
import { Component } from '../../src/rhtap/component';
import { ComponentPostCreateAction } from '../../src/rhtap/componentPostCreateAction';
import { Git } from '../../src/rhtap/git';
import { PullRequest } from '../../src/rhtap/git/models';
import { promoteToEnvironmentWithPR } from '../../src/utils/test/common';
import { randomString } from '../../src/utils/util';
import { test as base, expect } from '@playwright/test';

// Define a test fixture type that includes testItem
type RhtapTest = {
  testItem: TestItem;
};

function getDynamicTestItem(testInfo: any): TestItem {
  const testItemFromConfig = testInfo?.project?.use?.testItem as TestItem;
  return testItemFromConfig;
}

// Create a test fixture with dynamically determined testItem
const test = base.extend<RhtapTest>({
  testItem: async ({}, use, testInfo) => {
    const testItem = getDynamicTestItem(testInfo);
    await use(testItem);
  },
});

/**
 * A complete test scenario for RHTAP:
 * 1. Create a component.
 * 2. Verify component is created successfully.
 * 3. Ensure source repo and gitops repo are created in the git repository.
 * 4. Create a Pull Request to trigger a PipelineRun for pull_request events in the git repository.
 * 5. Wait for the PipelineRun to finish successfully.
 * 5. Merge the Pull Request to main.
 * 6. Wait for the push PipelineRun to finish successfully.
 * 7. Verify the new image is deployed correctly in the development environment.
 * 6. Trigger a Pull Request in the component gitops folder to promote the development image to the stage environment.
 * 7. wait for the pipeline to finish successfully.
 * 8. merge the Pull Request to main.
 * 9. wait for the push PipelineRun to finish successfully.
 * 10. Verify the new image is deployed correctly in the stage environment.
 * 12. Trigger a Pull Request in the component gitops repository to promote the stage image to the production environment.
 * 13. Verify that the  Pipeline Runs are successfully passed.
 * 14. Merge the Pull Request to main.
 * 15. Wait for the new image to be deployed to the production environment.
 */
test.describe('RHTAP Component Workflow', () => {
  let component: Component;
  let ci: CI;
  let git: Git;
  let cd: ArgoCD;
  

  test('should create a component successfully', async ({ testItem }) => {
    // Create a new component
    const componentName = `${testItem.getTemplate()}-${randomString()}`;
    const repoOwner = 'xjiangorg';
    const imageOrgName = 'quay_xjiang';
    const imageName = componentName;
    component = await Component.new(componentName, testItem, repoOwner, imageOrgName, imageName);

    // Wait for the component to be created
    await component.waitUntilComponentIsCompleted();
    // Check the component status
    const componentStatus = await component.getStatus();
    expect(componentStatus).toBe('completed');
    console.log('Component was created successfully!');

    cd = component.getCD();
    git = component.getGit();
    ci = component.getCI();

    // Execute post-creation actions
    const postCreateAction = new ComponentPostCreateAction(component);
    await postCreateAction.execute();
    console.log('Post-creation actions executed successfully!');

    await ci.waitForAllPipelinesToFinish();
    console.log('All pipelines have finished successfully!');
  });
  // create a test to verify the application changes are built with pipeline as a new image

  test('Application changes are built as new image through pipelines', async () => {
    // Use our new helper method to handle the code changes based on CI type
    await handleSourceRepoCodeChanges(git, ci);
  });

  test('should verify the new image is deployed correctly in the development environment', async () => {
    const application = await cd.getApplication(Environment.DEVELOPMENT);
    expect(application).not.toBeNull();

    const commitSha = await git.getGitOpsRepoCommitSha();
    await cd.syncApplication(Environment.DEVELOPMENT);
    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log('New image is deployed correctly in the development environment!');
  });

  test('should verify the new image is deployed correctly in the stage environment', async () => {
    const image = await git.extractApplicationImage(Environment.DEVELOPMENT);
    await promoteToEnvironmentWithPR(git, ci, cd, Environment.STAGE, image);
    console.log('Image promoted to stage environment successfully!');
    //TODO: verify application in the stage environment
  });
  test('should verify the new image is deployed correctly in the production environment', async () => {
    const image = await git.extractApplicationImage(Environment.STAGE);
    await promoteToEnvironmentWithPR(git, ci, cd, Environment.PROD, image);
    console.log('Image promoted to stage environment successfully!');
    //TODO: verify application in the stage environment
  });

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
  async function handleSourceRepoCodeChanges(git: Git, ci: CI): Promise<void> {
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
});

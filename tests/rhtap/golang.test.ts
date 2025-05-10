import { Environment } from '../../src/rhtap/cd/argocd';
import { ArgoCD } from '../../src/rhtap/cd/argocd';
import { CI } from '../../src/rhtap/ci';
import { Component } from '../../src/rhtap/component';
import { ComponentPostCreateAction } from '../../src/rhtap/componentPostCreateAction';
import { Git } from '../../src/rhtap/git';
import { handleSourceRepoCodeChanges } from '../../src/utils/test/common';
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { randomString } from '../../src/utils/util';
import { expect } from '@playwright/test';

// Create a basic test fixture with testItem
const test = createBasicFixture();

/**
 * Test suite for Go components in RHTAP
 *
 * This suite tests the complete workflow for Golang components in RHTAP:
 * 1. Component creation
 * 2. Pipeline execution
 * 3. Deployment verification
 * 4. Code changes and build verification
 */
test.describe('Golang Component Workflow', () => {
  // Shared variables for test steps
  let component: Component;
  let cd: ArgoCD;
  let ci: CI;
  let git: Git;

  test('should create a Golang component successfully', async ({ testItem }) => {
    // Generate component name directly in the test
    const componentName = `${testItem.getTemplate()}-${randomString()}`;
    console.log(`Creating component: ${componentName}`);

    // Create the component directly in the test
    component = await Component.new(componentName, testItem, componentName);

    // Wait for the component to be created
    await component.waitUntilComponentIsCompleted();

    // Verify component created successfully
    const componentStatus = await component.getStatus();
    expect(componentStatus).toBe('completed');

    // Verify template is 'go'
    expect(testItem.getTemplate()).toBe('go');

    console.log('Golang component was created successfully!');

    // Initialize shared resources
    cd = component.getCD();
    git = component.getGit();
    ci = component.getCI();

    // Execute post-creation actions
    const postCreateAction = new ComponentPostCreateAction(component);
    await postCreateAction.execute();
    console.log('Post-creation actions executed successfully!');
  });

  test('should have all resources created properly', async () => {
    // Wait for initial pipeline to complete
    await ci.waitForAllPipelinesToFinish();

    // Verify all resources were created as expected
    const resources = await component.getResources();
    expect(resources).toBeDefined();

    // Additional assertions can be added here based on expected resources
  });

  test('should build successfully when source code changes are made', async () => {
    // Test code changes trigger builds correctly
    await handleSourceRepoCodeChanges(git, ci);

    // Additional assertions to verify the build completed correctly
  });

  test('should deploy application correctly to development environment', async () => {
    const application = await cd.getApplication(Environment.DEVELOPMENT);
    expect(application).not.toBeNull();

    const commitSha = await git.getGitOpsRepoCommitSha();
    await cd.syncApplication(Environment.DEVELOPMENT);

    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);

    console.log('Golang application deployed correctly in the development environment!');
  });
});

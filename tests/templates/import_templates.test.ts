import { Component } from '../../src/rhtap/core/component';
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { Environment } from '../../src/rhtap/core/integration/cd/argocd';
import { expect } from '@playwright/test';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

/**
 * Import flow: scaffold app → strip catalog/.tekton → unregister catalog → import-repo task
 * (inputUrl = source repo; publish creates `{name}-reimport` repos — same repo name would fail on GitHub).
 *
 * Runs serially: prerequisites are the same as other E2E tests (`npm run generate-config`, `.env`, cluster access).
 * Which suites run is controlled by `testplan.json` / `TESTPLAN_NAME`, not by extra env vars in this file.
 */
test.describe.serial('Import Template Tests', () => {
  test.setTimeout(300000);

  let component: Component;
  let importedComponent: Component;

  test(`creates component from plan template (golden-path scaffold)`, async ({ testItem }) => {
    const baseName = testItem.getName();

    if (!baseName || baseName === 'undefined' || baseName.trim() === '') {
      throw new Error(`Invalid testItem name: "${baseName}". TestItem may not be properly initialized.`);
    }

    const componentName = `${baseName}-import`;
    const imageName = `${componentName}`;
    console.log(
      `Creating component: ${componentName} (template=${testItem.getTemplate()}, baseName=${baseName})`
    );

    try {
      component = await Component.new(componentName, testItem, imageName);

      expect(component).toBeDefined();
      expect(component.getName()).toBe(componentName);
      console.log(`Component ${componentName} created successfully`);
    } catch (error) {
      console.error(`❌ Failed to create component: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  });

  test(`waits for golden-path scaffold task to complete`, async () => {
    await component.waitUntilComponentIsCompleted();
    console.log(`Component ${component.getName()} creation completed`);
  });

  test(`waits for argocd sync after golden-path scaffold`, async () => {
    test.slow();

    const git = component.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = component.getCD();

    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for ${component.getName()} is synced and healthy`);
  });

  test(`verifies scaffolded source repo exists and has catalog-info.yaml`, async () => {
    const git = component.getGit();
    const componentName = component.getName();
    const gitType = git.getGitType();
    const owner = git.getRepoOwner();

    const repositoryExists = await git.checkIfRepositoryExists(owner, componentName);
    expect(repositoryExists).toBe(true);

    const catalogFileExists = await git.checkIfFileExistsInRepository(owner, componentName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);

    console.log(`Repository ${componentName} and catalog-info.yaml verified in ${gitType}`);
  });

  test(`deletes catalog file and tekton folder`, async () => {
    const git = component.getGit();
    const componentName = component.getName();
    const gitType = git.getGitType();
    const owner = git.getRepoOwner();

    await git.deleteFolderInRepository(owner, componentName, '.tekton');
    await git.deleteFileInRepository(owner, componentName, 'catalog-info.yaml');

    console.log(`Deleted .tekton and catalog-info.yaml from ${componentName} in ${gitType}`);
  });

  test(`deletes location from backstage`, async () => {
    const developerHub = component.getDeveloperHub();
    const componentName = component.getName();

    const entitySelector = `kind=Component,name=${componentName}`;

    const deleted = await developerHub.deleteEntitiesBySelector(entitySelector);
    expect(deleted).toBeTruthy();
    console.log(`Deleted entities for ${componentName} from Developer Hub`);
  });

  test(`runs import-repo scaffolder task`, async ({ testItem }) => {
    const componentName = component.getName();
    const expectedPublishName = `${componentName}-reimport`;

    try {
      importedComponent = await Component.importFromExistingRepository(component, testItem);

      expect(importedComponent).toBeDefined();
      expect(importedComponent.getName()).toBe(expectedPublishName);
      console.log(`import-repo task queued; publish repos ${expectedPublishName}(, -gitops)`);
    } catch (error) {
      console.error(`❌ Failed to run import-from-repo task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  });

  test(`waits for imported component to be finished`, async () => {
    await importedComponent.waitUntilComponentIsCompleted();
    console.log(`Imported component ${importedComponent.getName()} creation completed`);
  });

  test(`waits for imported component argocd to be synced in the cluster`, async () => {
    test.slow();

    const git = importedComponent.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = importedComponent.getCD();

    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for imported ${importedComponent.getName()} is synced and healthy`);
  });

  test(`verifies publish repo has catalog-info.yaml`, async () => {
    const git = importedComponent.getGit();
    const repoName = importedComponent.getName();
    const gitType = git.getGitType();
    const owner = git.getRepoOwner();

    const repositoryExists = await git.checkIfRepositoryExists(owner, repoName);
    expect(repositoryExists).toBe(true);

    const catalogFileExists = await git.checkIfFileExistsInRepository(owner, repoName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);

    console.log(`Repository ${repoName} after import-from-repo and catalog-info.yaml verified in ${gitType}`);
  });
});

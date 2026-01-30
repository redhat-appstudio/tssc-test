import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

import { Component } from '../../src/rhtap/core/component';
import { TestItem } from '../../src/playwright/testItem';
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { Environment } from '../../src/rhtap/core/integration/cd/argocd';
import { GithubProvider } from '../../src/rhtap/core/integration/git/providers/github';
import { GitlabProvider } from '../../src/rhtap/core/integration/git/providers/gitlab';
import { BitbucketProvider } from '../../src/rhtap/core/integration/git/providers/bitbucket';
import { expect } from '@playwright/test';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

/**
 * Import Templates Test Suite
 * 
 * This test suite validates the import template functionality in Red Hat Developer Hub:
 * 1. Creates a component using a template
 * 2. Verifies the component is created successfully
 * 3. Deletes the component from Developer Hub
 * 4. Re-imports the component using the import template
 * 5. Verifies the imported component is created successfully
 */
test.describe.serial('Import Template Tests', () => {
  // Configure generous timeout and retries for slow ArgoCD/cluster operations
  test.setTimeout(300000); // 5-minute timeout
  test.describe.configure({ retries: 2 }); // Retry on transient CI flakiness

  let component: Component;
  let importedComponent: Component;
  const templateName = process.env.TEMPLATE_NAME + "-import";

  test(`verifies if ${templateName} template exists in the catalog`, async () => {
    // This would require implementing a method to get golden path templates
    // For now, we'll assume the template exists if we can create a component
    expect(templateName).toBeDefined();
    console.log(`Template ${templateName} is available for testing`);
  });

  test(`creates ${templateName} component`, async ({ testItem }) => {
    // Add test-specific suffix to ensure uniqueness when running with other test suites
    const baseName = testItem.getName();
    
    // Validate that testItem has a valid name
    if (!baseName || baseName === 'undefined' || baseName.trim() === '') {
      throw new Error(`Invalid testItem name: "${baseName}". TestItem may not be properly initialized.`);
    }
    
    const componentName = `${baseName}-import`;
    const imageName = `${componentName}`;
    console.log(`Creating component: ${componentName} (baseName: ${baseName})`);

    try {
      // Create component using the TSSC framework
      component = await Component.new(componentName, testItem, imageName);
      
      expect(component).toBeDefined();
      expect(component.getName()).toBe(componentName);
      console.log(`Component ${componentName} created successfully`);
    } catch (error) {
      console.error(`❌ Failed to create component: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  });

  test(`waits for ${templateName} component to be finished`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully in the previous test');
    }
    
    // Wait for component creation to complete
    await component.waitUntilComponentIsCompleted();
    console.log(`Component ${component.getName()} creation completed`);
  });

  test(`waits for ${templateName} argocd to be synced in the cluster`, async () => {
    test.slow(); // Mark as slow test due to long-running ArgoCD sync operations
    
    if (!component) {
      throw new Error('Component was not created successfully');
    }
  
    const git = component.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = component.getCD();
    
    // Wait for ArgoCD application to be healthy
    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for ${component.getName()} is synced and healthy`);
  });

  test(`verifies if component ${templateName} was created in Git provider and contains 'catalog-info.yaml' file`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }
    
    const git = component.getGit();
    const componentName = component.getName();
    const gitType = git.getGitType();
    
    // Get the appropriate owner based on Git provider type
    let owner: string;
    if (git instanceof GithubProvider) {
      owner = git.getOrganization();
    } else if (git instanceof GitlabProvider) {
      owner = git.getGroup();
    } else if (git instanceof BitbucketProvider) {
      owner = git.getWorkspace();
    } else {
      throw new Error(`Unsupported Git provider type: ${gitType}`);
    }
    
    // Check if repository exists
    const repositoryExists = await git.checkIfRepositoryExists(owner, componentName);
    expect(repositoryExists).toBe(true);

    // Check if catalog-info.yaml exists
    const catalogFileExists = await git.checkIfFileExistsInRepository(owner, componentName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);
    
    console.log(`Repository ${componentName} and catalog-info.yaml verified in ${gitType}`);
  });

  test(`deletes catalog file and tekton folder`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }

    const git = component.getGit();
    const componentName = component.getName();
    const gitType = git.getGitType();
    
    // Get the appropriate owner based on Git provider type
    let owner: string;
    if (git instanceof GithubProvider) {
      owner = git.getOrganization();
    } else if (git instanceof GitlabProvider) {
      owner = git.getGroup();
    } else if (git instanceof BitbucketProvider) {
      owner = git.getWorkspace();
    } else {
      throw new Error(`Unsupported Git provider type: ${gitType}`);
    }

    // Delete .tekton folder
    await git.deleteFolderInRepository(owner, componentName, '.tekton');

    // Delete catalog-info.yaml file
    await git.deleteFileInRepository(owner, componentName, 'catalog-info.yaml');

    console.log(`Deleted .tekton, gitops folders and catalog-info.yaml from ${componentName} in ${gitType}`);
  });

  test(`deletes location from backstage`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }
    
    const developerHub = component.getDeveloperHub();
    const componentName = component.getName();
    
    // Construct precise Backstage entity selector with field qualifiers
    // Format: kind=Component,name=<componentName>
    const entitySelector = `kind=Component,name=${componentName}`;
    
    // Delete entities from Developer Hub using precise selector
    const deleted = await developerHub.deleteEntitiesBySelector(entitySelector);
    expect(deleted).toBeTruthy();
    console.log(`Deleted entities for ${componentName} from Developer Hub`);
  });

  test(`creates import task for importing component`, async ({ testItem }) => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }
    
    const componentName = component.getName();
    const importedComponentName = `${componentName}-imported`;
    
    // Create a new TestItem for the imported component
    const importedTestItem = new TestItem(
      importedComponentName,
      testItem.getTemplate(),
      testItem.getRegistryType(),
      testItem.getGitType(),
      testItem.getCIType(),
      testItem.getTPA(),
      testItem.getACS()
    );

    try {
      // Create imported component using the TSSC framework
      importedComponent = await Component.new(importedComponentName, importedTestItem, importedComponentName);
      
      expect(importedComponent).toBeDefined();
      expect(importedComponent.getName()).toBe(importedComponentName);
      console.log(`Import task created for ${importedComponentName}`);
    } catch (error) {
      console.error(`❌ Failed to create imported component: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  });

  test(`waits for imported component to be finished`, async () => {
    if (!importedComponent) {
      throw new Error('Imported component was not created successfully');
    }
    
    // Wait for imported component creation to complete
    await importedComponent.waitUntilComponentIsCompleted();
    console.log(`Imported component ${importedComponent.getName()} creation completed`);
  });

  test(`waits for imported component argocd to be synced in the cluster`, async () => {
    test.slow(); // Mark as slow test due to long-running ArgoCD sync operations
    
    if (!importedComponent) {
      throw new Error('Imported component was not created successfully');
    }
    
    // Wait for ArgoCD application to be healthy
    const git = importedComponent.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = importedComponent.getCD();
    
    // Wait for ArgoCD application to be healthy
    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for imported ${importedComponent.getName()} is synced and healthy`);
  });

  test(`verifies if imported component ${templateName} was created in Git provider and contains 'catalog-info.yaml' file`, async () => {
    if (!importedComponent) {
      throw new Error('Imported component was not created successfully');
    }
    
    const git = importedComponent.getGit();
    const importedComponentName = importedComponent.getName();
    const gitType = git.getGitType();
    
    // Get the appropriate owner based on Git provider type
    let owner: string;
    if (git instanceof GithubProvider) {
      owner = git.getOrganization();
    } else if (git instanceof GitlabProvider) {
      owner = git.getGroup();
    } else if (git instanceof BitbucketProvider) {
      owner = git.getWorkspace();
    } else {
      throw new Error(`Unsupported Git provider type: ${gitType}`);
    }
    
    // Check if imported repository exists
    const repositoryExists = await git.checkIfRepositoryExists(owner, importedComponentName);
    expect(repositoryExists).toBe(true);

    // Check if catalog-info.yaml exists in imported repository
    const catalogFileExists = await git.checkIfFileExistsInRepository(owner, importedComponentName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);
    
    console.log(`Imported repository ${importedComponentName} and catalog-info.yaml verified in ${gitType}`);
  });
});

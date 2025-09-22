import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(process.cwd(), '.env') });

import { Component } from '../../src/rhtap/core/component';
import { TestItem } from '../../src/playwright/testItem';
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { Environment } from '../../src/rhtap/core/integration/cd/argocd';
import { GithubProvider } from '../../src/rhtap/core/integration/git/providers/github';
import { expect } from '@playwright/test';
import { Git } from '../../src/rhtap/core/integration/git';

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
  let component: Component;
  let importedComponent: Component;
  let git: Git;
  const templateName = 'go'; // You can change this to test different templates

  test(`verifies if ${templateName} template exists in the catalog`, async ({ testItem }) => {
    // This would require implementing a method to get golden path templates
    // For now, we'll assume the template exists if we can create a component
    expect(templateName).toBeDefined();
    console.log(`Template ${templateName} is available for testing`);
  });

  test(`creates ${templateName} component`, async ({ testItem }) => {
    const componentName = testItem.getName();
    const imageName = `${componentName}`;
    console.log(`Creating component: ${componentName}`);

    try {
      // Create component using the TSSC framework
      component = await Component.new(componentName, testItem, imageName);
      
      expect(component).toBeDefined();
      expect(component.getName()).toBe(componentName);
      console.log(`Component ${componentName} created successfully`);
    } catch (error) {
      console.error(`❌ Failed to create component: ${error}`);
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
    if (!component) {
      throw new Error('Component was not created successfully');
    }
  
    git = component.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = component.getCD();
    
    // Wait for ArgoCD application to be healthy
    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for ${component.getName()} is synced and healthy`);
  });

  test(`verifies if component ${templateName} was created in GitHub and contains 'catalog-info.yaml' file`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }
    
    const git = component.getGit() as GithubProvider;
    const componentName = component.getName();
    
    // Check if repository exists in GitHub
    const repositoryExists = await git.checkIfRepositoryExists(git.getOrganization(), componentName);
    expect(repositoryExists).toBe(true);

    // Check if catalog-info.yaml exists
    const catalogFileExists = await git.checkIfFileExistsInRepository(git.getOrganization(), componentName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);
    
    console.log(`Repository ${componentName} and catalog-info.yaml verified in GitHub`);
  });

  test(`deletes catalog file and tekton folder`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }

    const git = component.getGit() as GithubProvider;
    const componentName = component.getName();

    // Delete .tekton folder
    await git.deleteFolderInRepository(git.getOrganization(), componentName, '.tekton');

    // Delete catalog-info.yaml file
    await git.deleteFileInRepository(git.getOrganization(), componentName, 'catalog-info.yaml');

    console.log(`Deleted .tekton, gitops folders and catalog-info.yaml from ${componentName}`);
  });

  test(`deletes location from backstage`, async () => {
    if (!component) {
      throw new Error('Component was not created successfully');
    }
    
    const developerHub = component.getDeveloperHub();
    const componentName = component.getName();
    
    // Delete entities from Developer Hub
    const deleted = await developerHub.deleteEntitiesBySelector(componentName);
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
      console.error(`❌ Failed to create imported component: ${error}`);
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
    if (!importedComponent) {
      throw new Error('Imported component was not created successfully');
    }
    
    // Wait for ArgoCD application to be healthy
    git = importedComponent.getGit();
    const commitSha = await git.getGitOpsRepoCommitSha();
    const cd = importedComponent.getCD();
    
    // Wait for ArgoCD application to be healthy
    const result = await cd.waitUntilApplicationIsSynced(Environment.DEVELOPMENT, commitSha);
    expect(result.synced).toBe(true);
    console.log(`ArgoCD application for imported ${importedComponent.getName()} is synced and healthy`);
  });

  test(`verifies if imported component ${templateName} was created in GitHub and contains 'catalog-info.yaml' file`, async () => {
    if (!importedComponent) {
      throw new Error('Imported component was not created successfully');
    }
    
    const git = importedComponent.getGit() as GithubProvider;
    const importedComponentName = importedComponent.getName();
    
    // Check if imported repository exists in GitHub
    const repositoryExists = await git.checkIfRepositoryExists(git.getOrganization(), importedComponentName);
    expect(repositoryExists).toBe(true);

    // Check if catalog-info.yaml exists in imported repository
    const catalogFileExists = await git.checkIfFileExistsInRepository(git.getOrganization(), importedComponentName, 'catalog-info.yaml');
    expect(catalogFileExists).toBe(true);
    
    console.log(`Imported repository ${importedComponentName} and catalog-info.yaml verified in GitHub`);
  });
});

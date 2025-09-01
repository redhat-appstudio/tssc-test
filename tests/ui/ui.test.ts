import { createBasicFixture } from '../../src/utils/test/fixtures';
import { UiComponent } from '../../src/ui/uiComponent';
import { CommonPO } from '../../src/ui/page-objects/common_po';
import { hideQuickStartIfVisible } from '../../src/ui/common';
import { CIType } from '../../src/rhtap/core/integration/ci';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

/**
 * A complete test scenario for RHTAP UI plugins test:
 *
 * This test suite check the plugin in the UI and uses the component from backend e2e test.
 * This test should not 
 * 1. Login to the UI
 * TODO:
 * 2. Find a component in the UI
 * 3. Check the ArgoCD integration on the Overview page
 * 4. Check the CI integration and existing pipelines
 * 5. Check the CD tab and verify information shown
 * 6. Check the Image Registry tab and verify information shown
 */
test.describe('RHTAP UI Test Suite', () => {
  // Shared variables for test steps
  let component: UiComponent;

  test.beforeAll('', async ({ testItem }) => {
    console.log('Running UI test for:', testItem);
    const componentName = testItem.getName();
    console.log(`Creating component: ${componentName}`);

    // Assign the already created component 
    component = await UiComponent.new(componentName, testItem, componentName);
  });

  test.describe('Go to home page', () => {
    test('open developer hub and log in', async ({ page }) => {
      await page.goto(component.getCoreComponent().getDeveloperHub().getUrl(), {
        timeout: 20000,
      });
      await page
        .getByRole('heading', { name: CommonPO.welcomeTitle })
        .waitFor({ state: 'visible', timeout: 20000 });
    });
  });

  test.describe("Verify Git", () => {
    test('verify "View Source" link', async ({ page }) => {
      // Skip test for not yet supported git providers
      if (component.getGit() === undefined) {
        console.warn(`Skipping Git test as testing ${component.getCoreComponent().getGit().getGitType()} is not supported`);
        test.skip();
        return;
      }

      const componentUrl = component.getComponentUrl();
      await page.goto(componentUrl, { timeout: 20000 });
        
      await page.waitForLoadState('domcontentloaded');
      await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });

      await component.getGit()!.checkViewSourceLink(page);
    });
  });
  
  test.describe("Verify CI", () => {
    test('verify CI provider on CI tab', async ({ page }) => {
      if (component.getCoreComponent().getCI().getCIType() === CIType.GITHUB_ACTIONS) {
        console.warn(`Skipping CI test as testing ${component.getCoreComponent().getCI().getCIType} is not supported`);
        test.skip();
        return;
      }

      const componentUrl = component.getComponentUrl();
      const ciTabUrl = `${componentUrl}/ci`;
      await page.goto(ciTabUrl, { timeout: 20000 });

      await page.waitForLoadState('domcontentloaded');
      await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });
    });
  });

  test.describe("Verify Docs", () => {
    test('test docs', async ({ page }) => {
      const docsPlugin = component.getDocs();

      // Navigate to docs page
      await page.goto(`${component.getComponentUrl()}/docs`, {
        timeout: 20000,
      });

      // Hide Quick start side panel
      // WORKAROUND FOR: https://issues.redhat.com/browse/RHDHBUGS-1946
      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 20000 });

      await test.step('Check article display', async () => { 
        await docsPlugin.checkArticle(page);
      }, {timeout: 60000});

      await test.step('Check component name', async () => { 
        await docsPlugin.checkComponentName(page);
      }, {timeout: 20000});
  
      await test.step('Check source link', async () => {
        await docsPlugin.checkSourceLink(page);
      }, {timeout: 20000});

      await test.step('Check gitops link', async () => {
        await docsPlugin.checkGitopsLink(page);
      }, {timeout: 20000});
    });
  });

  test.describe('Test Image Registry', () => {
    test('test image registry', async ({ page }) => {
      const registryPlugin = component.getRegistry();

      if (registryPlugin === undefined) {
        console.warn(`Skipping Image Registry test as testing ${component.getCoreComponent().getRegistry().getRegistryType()} is not supported`);
        test.skip();
        return;
      }

      // Navigate to image registry page
      await page.goto(`${component.getComponentUrl()}/image-registry`, {
        timeout: 20000,
      });

      await test.step('Check repository heading', async () => {
        await registryPlugin.checkRepositoryHeading(page);
      }, { timeout: 20000 });

      await test.step('Check repository link', async () => {
        await registryPlugin.checkRepositoryLink(page);
      }, { timeout: 20000 });

      await test.step('Check search input field', async () => {
        await registryPlugin.checkSearchInputField(page);
      }, { timeout: 20000 });

      await test.step('Check table column headers', async () => {
        await registryPlugin.checkTableColumnHeaders(page);
      }, { timeout: 20000 });

      await test.step('Check image table content', async () => {
        await registryPlugin.checkImageTableContent(page);
      }, { timeout: 20000 });

      // The security scan is not yet finished right after installation
      // await test.step('Check vulnerabilities', async () => {
      //   await registryPlugin.checkVulnerabilities(page);
      // }, { timeout: 20000 });
    });
  });
});

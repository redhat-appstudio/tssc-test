import { createBasicFixture } from '../../src/utils/test/fixtures';
import { UiComponent } from '../../src/ui/uiComponent';
import { CommonPO } from '../../src/ui/page-objects/commonPo';
import { hideQuickStartIfVisible } from '../../src/ui/common';
import { waitForPageLoad } from '../../src/ui/common';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

/**
 * A complete test scenario for RHTAP UI plugins test:
 *
 * This test suite check the plugin in the UI and uses the component from backend e2e test.
 * This test intentionally does not:
 * 1. Login to the UI (done by auth-setup.ts)
 * 2. Check the gitops resource (done by gitopsResource.test.ts)
 * TODO:
 * 3. Check the ArgoCD integration on the Overview page
 * 4. Check the CI integration and existing pipelines
 * 5. Check the CD tab and verify information shown
 * 6. Check the Image Registry tab and verify information shown
 */
test.describe('Component UI Test Suite', () => {
  // Shared variables for test steps
  let component: UiComponent;

  test.beforeAll(async ({ testItem }) => {
    console.log('Running UI test for component:', testItem.getName());
    const componentName = testItem.getName();
    console.log(`Creating component: ${componentName}`);

    // Assign the already created component
    component = await UiComponent.new(componentName, testItem, componentName);
  });

  test.describe('Go to home page', () => {
    test('open developer hub', async ({ page }) => {
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

      await page.goto(component.getComponentUrl(), { timeout: 20000 });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await component.getGit()!.checkViewSourceLink(page);
    });
  });

  test.describe("Verify CI", () => {
    test('verify CI provider on CI tab', async ({ page }) => {
      const ciPlugin = component.getCI();

      if (ciPlugin === undefined) {
        console.warn(`Skipping CI test as testing ${component.getCoreComponent().getCI().getCIType()} is not supported`);
        test.skip();
        return;
      }

      // Navigate to CI tab
      await page.goto(`${component.getComponentUrl()}/ci`, { timeout: 20000 });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Hide Quick start side panel', async () => {
        await hideQuickStartIfVisible(page);
      }, { timeout: 20000 });

      await test.step("Check CI heading", async () => {
        await ciPlugin.checkCIHeading(page);
      }, {timeout: 20000});

      await test.step("Check CI table content", async () => {
        await ciPlugin!.checkActions(page);
      }, {timeout: 40000});
    });
  });

  test.describe("Verify Docs", () => {
    test('test docs', async ({ page }) => {
      const docsPlugin = component.getDocs();

      // Navigate to docs page
      await page.goto(`${component.getComponentUrl()}/docs`, {
        timeout: 20000,
      });
      await waitForPageLoad(page, component.getCoreComponent().getName());

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

<<<<<<< HEAD:tests/ui/component.test.ts
  test.describe("Check dependencies tab and gitops dependency", () => {

    test('test dependency', async ({ page }) => {
      const dependencies = component.getDependencies();
      await page.goto(`${component.getComponentUrl()}/dependencies`, {
        timeout: 20000,
      });
      await waitForPageLoad(page, component.getCoreComponent().getName());

      await test.step('Check all boxes', async () => {
        await dependencies.checkAllBoxesPresent(page);
      }, {timeout: 30000});

      await test.step('Check nodes and go to gitops dependency', async () => {
        await dependencies.checkRelationsTitle(page);
        await dependencies.checkNodesPresent(page);
      }, {timeout: 30000});
    });
  });
});
=======
  test.describe("Verify Pipeline Runs", () => {
    test('verify pipeline runs table', async ({ page }) => {
      const ciTabUrl = `${component.getComponentUrl()}/ci`;
      await page.goto(ciTabUrl, { timeout: 20000 });
      await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });

      // Check shield icon next to name
      await expect(page.locator('svg[data-testid="ErrorOutlineIcon"]')).toBeVisible();
      // Check vulnerabilities are shown
      await expect(page.getByText('VULNERABILITIES')).toBeVisible();
      // Check status is Succeeded with tick icon
      await expect(page.getByText('Succeeded')).toBeVisible();
      await expect(page.locator('svg[data-testid="CheckCircleIcon"]')).toBeVisible();
      // Check started column has date/time format
      await expect(page.getByText(/\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)/)).toBeVisible();
      // Check task status has visible progress bar
      await expect(page.locator('[role="progressbar"]')).toBeVisible();
      // Check duration is visible
      await expect(page.getByText(/\d+\s+minutes?\s+\d+\s+seconds?/)).toBeVisible();
    });
  });
});
>>>>>>> fbf9b85 (tests(ui): add Verify Pipeline Runs test for RHTAPUI-101):tests/ui/ui.test.ts

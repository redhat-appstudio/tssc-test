
import { createBasicFixture } from '../../src/utils/test/fixtures';
import { UiComponent } from '../../src/ui/uiComponent';
import { hideQuickStartIfVisible, openTab } from '../../src/ui/common';
import { waitForPageLoad } from '../../src/ui/common';
import { CIType } from '../../src/rhtap/core/integration/ci';

/**
 * Create a basic test fixture with testItem
 */
const test = createBasicFixture();

test.describe('Gitops Resource UI Test Suite', () => {
  // Shared variables for test steps
  let component: UiComponent;

  test.beforeAll(async ({ testItem }) => {
    console.log('Running UI test for gitops resource:', testItem.getName());
    const componentName = testItem.getName();
    console.log(`Creating component: ${componentName}`);

    // Assign the already created component
    component = await UiComponent.new(componentName, testItem, componentName);
  });

  test('Check gitops git link', async ({ page }) => {
    // Skip test for not yet supported git providers
    if (component.getGit() === undefined) {
      console.warn(`Skipping Git test as testing ${component.getCoreComponent().getGit().getGitType()} is not supported`);
      test.skip();
      return;
    }
    await page.goto(`${component.getGitopsResourceUrl()}`, { timeout: 20000 });
    await waitForPageLoad(page, `${component.getCoreComponent().getName()}-gitops`);
    await component.getGit()!.checkViewSourceLink(page);
  });


  test('Test Gitops Docs', async ({ page }) => {
    await test.step('Hide Quick start side panel', async () => {
      await page.goto(`${component.getGitopsResourceUrl()}/docs`, { timeout: 20000 });
      await waitForPageLoad(page, `${component.getCoreComponent().getName()}-gitops`);
      await hideQuickStartIfVisible(page);
    });

   await test.step('Test Gitops Docs', async () => {
      const docsPlugin = component.getDocs();
      await openTab(page, 'Docs');
      await waitForPageLoad(page, `${component.getCoreComponent().getName()}-gitops`);
      await docsPlugin.checkArticle(page);
    });
  });

  test("Verify CI", async ({ page }) => {
    if (component.getCoreComponent().getCI().getCIType() === CIType.GITHUB_ACTIONS) {
      console.warn(`Skipping CI test as testing ${component.getCoreComponent().getCI().getCIType} is not supported`);
      test.skip();
      return;
    }

    await page.goto(`${component.getGitopsResourceUrl()}/ci`, { timeout: 20000 });
    await waitForPageLoad(page, `${component.getCoreComponent().getName()}-gitops`);
  });

});


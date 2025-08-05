import { createBasicFixture } from '../../src/utils/test/fixtures';
import { UiComponent } from '../../src/ui/uiComponent';
import { loadFromEnv } from '../../src/utils/util';
import { CommonPO } from '../../src/ui/page-objects/common_po';

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
    const imageName = `${componentName}`;
    console.log(`Creating component: ${componentName}`);

    // Assign the already created component 
    component = await UiComponent.new(componentName, testItem, imageName);
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
      const componentUrl = component.getComponentUrl();
      await page.goto(componentUrl, { timeout: 20000 });
        
      await page.waitForLoadState('domcontentloaded');
      await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });
        
      await component.getGit().checkViewSourceLink(page);
    });
  });

  test.describe("Verify CI", () => {
    test('verify Tekton CI provider on CI tab', async ({ page }) => {
      const componentUrl = component.getComponentUrl();
      const ciTabUrl = `${componentUrl}/ci`;
      await page.goto(ciTabUrl, { timeout: 20000 });
        
      await page.waitForLoadState('domcontentloaded');
      await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });
    });
  });
}); 
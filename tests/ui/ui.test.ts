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
  /**
   * Test case: Verify "View Source" link functionality
   * 
   * This test verifies that the Git integration is properly displayed in the UI by:
   * 1. Navigate to the component page in Developer Hub
   * 2. Wait for the component page to load completely
   * 3. Locate the "View Source" link that points to GitHub repository
   * 4. Verify the link is visible and clickable
   * 5. Validate that the link URL responds with HTTP 200 (repository exists)
   * 6. Log the GitHub repository URL for verification
   */
  test.describe("Verify Git", () => {
    test('verify "View Source" link', async ({ page }) => {
      const componentUrl = component.getComponentUrl();
      await page.goto(componentUrl, { timeout: 20000 });
        
      await page.waitForLoadState('domcontentloaded');
      await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });
      
      await component.getGit().checkViewSourceLink(page);
    });
  });
});
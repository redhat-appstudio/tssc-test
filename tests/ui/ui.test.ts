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
   * A simple test scenario for RHTAP UI GitHub link verification:
   *
   * This test assumes authentication is already done by a separate test case.
   * Test steps:
   * 1. Navigate to component page
   * 2. Find and verify GitHub "View Source" link
   * 3. Verify link is accessible
   */
  test('should find GitHub "View Source" link', async ({ page, testItem }) => {
    const componentUrl = component.getComponentUrl();
    await page.goto(componentUrl, { timeout: 20000 });
    
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('heading', { name: component.getCoreComponent().getName() }).waitFor({ state: 'visible', timeout: 20000 });
    
    const githubLink = page.locator('a[href*="github.com"]:has-text("View Source")').first();
    
    await githubLink.waitFor({ state: 'visible', timeout: 10000 });
    
    const linkHref = await githubLink.getAttribute('href');
    
    test.expect(githubLink).toBeTruthy();
    
    const isClickable = await githubLink.isEnabled();
    test.expect(isClickable).toBe(true);
    
    const response = await page.request.head(linkHref!);
    const status = response.status();
    
    const validStatuses = [200, 201, 202, 301, 302, 304];
    test.expect(validStatuses).toContain(status);
    
    console.log(`GitHub URL: ${linkHref}`);
  });
});
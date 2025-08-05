import { expect, Page, Locator } from '@playwright/test';

/**
 * Clicks on a component and verifies that a specific element appears on the new page, then closes the tab
 * @param page - The Playwright page object
 * @param componentToClick - The element/locator to click on
 * @param expectedElement - The locator for the element that should appear after page load
 */
export async function clickAndVerifyPageLoad(
    page: Page,
    componentToClick: Locator,
    expectedElement: Locator
): Promise<void> {
    // Click on the component
    await componentToClick.click();
    
    // Check that the page is loaded by verifying the expected element is visible
    await expect(expectedElement).toBeVisible();
    
    // Close the tab
    await page.close();
}

/**
 * Checks if a website URL returns an expected status code
 * @param page - The Playwright page object
 * @param href - The URL to check
 * @param expectedStatus - The expected HTTP status code (defaults to 200)
 */
export async function checkWebsiteStatus(
    page: Page,
    href: string,
    expectedStatus: number = 200
): Promise<void> {
    const response = await page.request.head(href);
    const status = response.status();
    expect(status).toBe(expectedStatus);
}

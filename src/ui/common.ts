import { expect, Page } from '@playwright/test';

/**
 * Checks if a website URL returns an expected status code
 * @param page - The Playwright page object
 * @param href - The URL to check
 * @param expectedStatus - The expected HTTP status code (defaults to 200)
 */
export async function checkWebsiteStatus(
    page: Page,
    href: string,
    okStatuses: number[] = [200, 204, 301, 302, 307, 308]
): Promise<void> {
    const response = await page.request.head(href);
    expect(okStatuses).toContain(response.status());
}

/**
 * Hides the Quick start side panel if it is visible
 * @param page - The Playwright page object
 */
export async function hideQuickStartIfVisible(page: Page): Promise<void> {
    // Wait for the page to be loaded by checking the self service icon
    const selfServiceIcon = page.getByTestId('AddCircleOutlineIcon');
    await selfServiceIcon.waitFor({ state: 'visible', timeout: 20000 });

    // Wait for welcome paragraph to be visible 
    const welcomeParagraph = page.getByText("Let's get you started with Developer Hub", { exact: true });
    const hideButton = page.getByRole('button', { name: 'Hide' });
    try {
      await welcomeParagraph.waitFor({ state: 'visible', timeout: 2000 });
      await hideButton.click({ timeout: 2000 });
      console.log('Paragraph visible; hiding Quick start side panel');
    } catch {
      console.log('Paragraph not visible; skipping hide');
    }

    await expect(welcomeParagraph).toBeHidden({ timeout: 10000 });
  }

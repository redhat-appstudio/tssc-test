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
    expectedStatus: number = 200
): Promise<void> {
    const response = await page.request.head(href);
    const status = response.status();
    expect(status).toBe(expectedStatus);
}

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

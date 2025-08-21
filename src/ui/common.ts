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

export async function waitForPageLoad(page: Page, name: string) {
    const progressBars = page.getByRole('progressbar');
    // Get all progressbar elements and wait until all are hidden
    const bars = await progressBars.all();
    if (bars.length > 0) {
        await Promise.all(
            bars.map(bar => expect(bar).toBeHidden({ timeout: 10000 }))
        );
    }

    await expect(page.getByTestId('sidebar-root')).toBeAttached({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: name })).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState();
}

export async function openTab(page: Page, tabName: string) {
    const tab = page.getByRole('tablist').getByText(tabName);
    await tab.click();
}
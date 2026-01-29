import { expect, Page, Locator } from '@playwright/test';
import { LoggerFactory } from '../logger/logger';
import type { Logger } from '../logger/logger';

const logger: Logger = LoggerFactory.getLogger('ui.common');

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
      logger.debug('Paragraph visible; hiding Quick start side panel');
    } catch {
      logger.debug('Paragraph not visible; skipping hide');
    }

    await expect(welcomeParagraph).toBeHidden({ timeout: 10000 });
}

export async function waitForPageLoad(page: Page, name: string) {
    const progressBars = page.getByRole('main').getByRole('progressbar');
    // Get all progressbar elements and wait until all are hidden
    const bars = await progressBars.all();
    await Promise.all(
        bars.map(bar => expect(bar).toBeHidden({ timeout: 90000 }))
    );

    await expect(page.getByTestId('sidebar-root')).toBeAttached({ timeout: 30000 });

    await expect(page.getByRole('heading', { name: name }).first()).toBeVisible({ timeout: 20000 });
    await page.waitForLoadState();
}

export async function openTab(page: Page, tabName: string) {
    const tab = page.getByRole('tablist').getByText(tabName);
    await tab.click();
}

/**
 * Applies a blur filter to the locator element
 * @param locator - Locator to blur
 */
export async function blurLocator(locator: Locator): Promise<void> {
    await locator.evaluate(el => { (el as HTMLElement).style.filter = 'blur(5px)'; });
}

import { expect, Page, Locator } from '@playwright/test';
import { GhLoginPO } from './page-objects/loginPo';
import { loadFromEnv } from '../utils/util';
import { authenticator } from 'otplib';
import retry from 'async-retry';

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

export async function waitForPageLoad(page: Page, name: string) {
    const progressBars = page.getByRole('main').getByRole('progressbar');
    // Get all progressbar elements and wait until all are hidden
    const bars = await progressBars.all();
    await Promise.all(
        bars.map(bar => expect(bar).toBeHidden({ timeout: 90000 }))
    );

    await expect(page.getByTestId('sidebar-root')).toBeAttached({ timeout: 10000 });

    // Handle "Login Required" dialog if it appears (e.g., GitHub Actions plugin)
    await handleGitHubActionsLoginDialog(page);

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

/**
 * Handles the GitHub Actions plugin "Login Required" dialog.
 * Clicks "Log in", handles the GitHub OAuth popup with credentials and 2FA.
 * @param page - The Playwright page object
 */
export async function handleGitHubActionsLoginDialog(page: Page): Promise<void> {
    const loginDialog = page.getByRole('heading', { name: 'Login Required' });

    try {
        await loginDialog.waitFor({ state: 'visible', timeout: 3000 });
        console.log('GitHub Actions Login Required dialog detected');

        // Click the "Log in" button to start OAuth flow
        const logInButton = page.getByRole('button', { name: 'Log in' });

        // Wait for the popup page
        const popupPromise = page.context().waitForEvent('page');
        await logInButton.click();
        const popup = await popupPromise;

        await popup.bringToFront();
        await popup.waitForLoadState();

        // Fill GitHub credentials
        await popup.locator(GhLoginPO.githubLoginField).fill(loadFromEnv("GH_USERNAME"));
        await popup.locator(GhLoginPO.githubPasswordField).fill(loadFromEnv('GH_PASSWORD'));
        await popup.locator(GhLoginPO.githubSignInButton).click();
        await popup.waitForLoadState();

        // Handle 2FA
        const twoFactorField = popup.locator(GhLoginPO.github2FAField);
        const maxRetries = 5;
        const timeout = 30000;

        await retry(
            async (): Promise<void> => {
                const secret = loadFromEnv("GH_SECRET");
                const token = authenticator.generate(secret);
                await blurLocator(twoFactorField);
                await twoFactorField.fill(token);
                await twoFactorField.waitFor({ state: 'detached', timeout: 5000 });
            },
            {
                retries: maxRetries,
                minTimeout: timeout,
                maxTimeout: timeout,
                onRetry: (_error: Error, attemptNumber: number) => {
                    console.log(`[GITHUB-ACTIONS-RETRY ${attemptNumber}/${maxRetries}] 2FA token entry failed, retrying...`);
                },
            }
        );

        // Handle authorize button if needed
        const authorizeButton = popup.getByRole('button', { name: 'authorize' });
        try {
            await authorizeButton.waitFor({ state: 'visible', timeout: 3000 });
            await authorizeButton.click();
            console.log('GitHub Actions authorization button clicked');
        } catch {
            console.log('GitHub Actions authorize button not found or not needed');
        }

        // Wait for dialog to close
        await loginDialog.waitFor({ state: 'hidden', timeout: 10000 });
        console.log('GitHub Actions OAuth completed successfully');

    } catch {
        // Dialog not present or already handled, continue
    }
}

import { expect, Page, Locator } from '@playwright/test';
import { GhLoginPO } from './page-objects/loginPo';
import { CiPo } from './page-objects/ciPo';
import { loadFromEnv } from '../utils/util';
import { authenticator } from 'otplib';
import retry from 'async-retry';

/**
 * Configuration options for GitHub authentication
 */
interface GitHubAuthOptions {
    /** Context name for logging (e.g., 'GITHUB-ACTIONS', 'OAUTH') */
    logPrefix?: string;
}

/**
 * Shared helper to perform GitHub login with username/password and 2FA.
 * This consolidates authentication logic used across different contexts.
 *
 * @param page - Playwright Page object where login form is displayed
 * @param options - Configuration options
 */
export async function performGitHubLogin(page: Page, options: GitHubAuthOptions = {}): Promise<void> {
    const logPrefix = options.logPrefix || 'GITHUB-AUTH';

    // Load credentials once before retry loop
    const username = loadFromEnv('GH_USERNAME');
    const password = loadFromEnv('GH_PASSWORD');
    const secret = loadFromEnv('GH_SECRET');

    // Fill login credentials
    await page.locator(GhLoginPO.githubLoginField).fill(username);
    await page.locator(GhLoginPO.githubPasswordField).fill(password);
    await page.locator(GhLoginPO.githubSignInButton).click();
    await page.waitForLoadState('domcontentloaded');

    // Handle 2FA if required
    const twoFactorField = page.locator(GhLoginPO.github2FAField);

    try {
        await twoFactorField.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
        // 2FA not required
        console.warn(`[${logPrefix}] 2FA not required`);
        return;
    }

    // Retry inserting 2FA token for cases when it was already used
    const maxRetries = 5;
    const retryTimeout = 30000; // token resets every 30 seconds

    await retry(
        async (): Promise<void> => {
            const token = authenticator.generate(secret);
            await blurLocator(twoFactorField);
            await twoFactorField.fill(token);
            await twoFactorField.waitFor({ state: 'detached', timeout: 5000 });
        },
        {
            retries: maxRetries,
            minTimeout: retryTimeout,
            maxTimeout: retryTimeout,
            onRetry: (_error: Error, attemptNumber: number) => {
                console.warn(`[${logPrefix}] Retry ${attemptNumber}/${maxRetries}: 2FA token entry failed, waiting ${retryTimeout}ms...`);
            },
        }
    );
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
    const loginDialog = page.getByRole('heading', { name: CiPo.loginRequiredDialogTitle });

    try {
        await loginDialog.waitFor({ state: 'visible', timeout: 3000 });
        console.log('GitHub Actions Login Required dialog detected');

        // Click the "Log in" button to start OAuth flow
        const logInButton = page.getByRole('button', { name: CiPo.githubLoginButtonText });

        // Wait for the popup page
        const popupPromise = page.context().waitForEvent('page');
        await logInButton.click();
        const popup = await popupPromise;

        await popup.bringToFront();
        await popup.waitForLoadState();

        // Use shared authentication helper
        await performGitHubLogin(popup, { logPrefix: 'GITHUB-ACTIONS-OAUTH' });

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

import { expect, Page } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { GitPO } from '../../page-objects/commonPo';
import { GhLoginPO } from '../../page-objects/loginPo';
import { loadFromEnv } from '../../../utils/util';
import { authenticator } from 'otplib';
import retry from 'async-retry';

export class GithubActionsPlugin extends BaseCIPlugin {
    constructor(name: string, registryOrg: string) {
        super(name, registryOrg);
    }

    // checkCIHeading is inherited from BaseCIPlugin which checks for heading or tab

    // eslint-disable-next-line no-unused-vars
    public async checkActions(_page: Page): Promise<void> {
        // GitHub Actions workflow runs are shown in the main table, no additional actions needed
    }

    public async checkPipelineRunsTable(page: Page): Promise<void> {
        const overviewUrl = page.url().replace(/\/ci(?:\?.*)?$/, '');
        await page.goto(overviewUrl, { timeout: 20000 });
        await page.waitForLoadState('domcontentloaded');

        const viewSourceLink = page.locator(`${GitPO.githubLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await expect(viewSourceLink).toBeVisible({ timeout: 20000 });

        const repoUrl = await viewSourceLink.getAttribute('href');
        if (!repoUrl) {
            throw new Error('Missing repository URL on View Source link');
        }

        const githubPagePromise = page.context().waitForEvent('page');
        await viewSourceLink.click();
        const githubPage = await githubPagePromise;
        await githubPage.waitForLoadState('domcontentloaded');

        const actionsUrl = this.buildActionsUrl(repoUrl);
        await githubPage.goto(actionsUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });

        // Handle GitHub login if required
        await this.handleGitHubLoginIfRequired(githubPage);

        await expect(githubPage).toHaveURL(actionsUrl, { timeout: 20000 });

        await githubPage.close();
    }

    /**
     * Handles GitHub login if the login page is displayed.
     * Performs username/password authentication and 2FA if required.
     *
     * @param page - Playwright Page object for the GitHub page
     */
    private async handleGitHubLoginIfRequired(page: Page): Promise<void> {
        const loginField = page.locator(GhLoginPO.githubLoginField);

        // Check if login is required (login field is visible)
        try {
            await loginField.waitFor({ state: 'visible', timeout: 5000 });
        } catch {
            // Login not required, page is already authenticated
            console.warn('[GITHUB-ACTIONS] Login not required, already authenticated');
            return;
        }

        console.warn('[GITHUB-ACTIONS] Login required, performing authentication...');

        // Fill login credentials
        await loginField.fill(loadFromEnv('GH_USERNAME'));
        await page.locator(GhLoginPO.githubPasswordField).fill(loadFromEnv('GH_PASSWORD'));
        await page.locator(GhLoginPO.githubSignInButton).click();
        await page.waitForLoadState('domcontentloaded');

        // Handle 2FA if required
        const twoFactorField = page.locator(GhLoginPO.github2FAField);

        try {
            await twoFactorField.waitFor({ state: 'visible', timeout: 5000 });
        } catch {
            // 2FA not required
            console.warn('[GITHUB-ACTIONS] 2FA not required');
            return;
        }

        console.warn('[GITHUB-ACTIONS] 2FA required, entering token...');

        // Retry inserting 2FA token for cases when it was already used
        const maxRetries = 5;
        const timeout = 30000; // token resets every 30 seconds

        await retry(
            async (): Promise<void> => {
                const token = this.getGitHub2FAOTP();
                // Blur the field to avoid 2FA token being captured by screenshot or video
                await twoFactorField.evaluate((el) => (el.style.filter = 'blur(5px)'));
                await twoFactorField.fill(token);
                // The field should detach after successful auth
                await twoFactorField.waitFor({ state: 'detached', timeout: 5000 });
            },
            {
                retries: maxRetries,
                minTimeout: timeout,
                maxTimeout: timeout,
                onRetry: (_error: Error, attemptNumber: number) => {
                    console.warn(
                        `[GITHUB-ACTIONS] Retry ${attemptNumber}/${maxRetries}: 2FA token entry failed, waiting ${timeout}ms...`
                    );
                },
            }
        );

        console.warn('[GITHUB-ACTIONS] Authentication completed successfully');
    }

    /**
     * Generates a 2FA token for GitHub authentication.
     * Uses the TOTP secret from environment variables.
     *
     * @returns The generated 2FA token
     */
    private getGitHub2FAOTP(): string {
        const secret = loadFromEnv('GH_SECRET');
        return authenticator.generate(secret);
    }

    private buildActionsUrl(repoUrl: string): string {
        const trimmedUrl = repoUrl.endsWith('/') ? repoUrl.slice(0, -1) : repoUrl;
        return `${trimmedUrl}/actions`;
    }
}

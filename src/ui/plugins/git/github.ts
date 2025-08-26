/**
 * GitHub UI Plugin
 *
 * Implements UI automation for GitHub-specific operations.
 * Handles GitHub login flow including 2FA authentication.
 */

import { GitPlugin } from './gitUiInterface';
import { expect, Page, test } from '@playwright/test';
import { loadFromEnv } from '../../../utils/util';
import { DHLoginPO, GhLoginPO } from '../../page-objects/login_po';
import { GitPO } from '../../page-objects/common_po';
import { Git } from '../../../rhtap/core/integration/git/gitInterface';
import { authenticator } from 'otplib';
import retry from 'async-retry';

export class GithubUiPlugin implements GitPlugin {
    private githubProvider: Git;

    constructor(
        git: Git
    ) {
        this.githubProvider = git
    }

    /**
     * Performs GitHub login through the Developer Hub UI.
     * Handles the complete login flow including:
     * - Initial sign-in button click
     * - GitHub credentials input
     * - 2FA authentication
     * - Authorization confirmation
     *
     * @param page - Playwright Page object for UI interactions
     */
    async login(page: Page): Promise<void> {
        const button = page.getByRole('button', { name: DHLoginPO.signInButtonName });
        await expect(button).toBeVisible({ timeout: 15000 })

        const authorizeAppPagePromise = page.context().waitForEvent('page');
        await button.click();
        const authorizeAppPage = await authorizeAppPagePromise;
        await authorizeAppPage.bringToFront();
        await authorizeAppPage.waitForLoadState();
        await authorizeAppPage.locator(GhLoginPO.githubLoginField).fill(loadFromEnv("GH_USERNAME"));
        await authorizeAppPage.locator(GhLoginPO.githubPasswordField).fill(loadFromEnv('GH_PASSWORD'));
        await authorizeAppPage.locator(GhLoginPO.githubSignInButton).click();
        await authorizeAppPage.waitForLoadState();

        const twoFactorField = authorizeAppPage.locator(GhLoginPO.github2FAField);

        // Retry inserting 2FA token for cases when it was already used
        const maxRetries = 5;
        const timeout = 30000; // token resets every 30 seconds
        await retry(
            async (): Promise<void> => {
                const token = await this.getGitHub2FAOTP();
                // blur the field to avoid 2FA token being captured by screenshot or video
                await twoFactorField.evaluate((el) => el.style.filter = 'blur(5px)');
                await twoFactorField.fill(token);
                // The field should detach after successful auth
                await twoFactorField.waitFor({ state: 'detached', timeout: 5000 });
            },
            {
                retries: maxRetries,
                minTimeout: timeout,
                maxTimeout: timeout,
                onRetry: (_error: Error, attemptNumber: number) => {
                    console.log(`[GITHUB-RETRY ${attemptNumber}/${maxRetries}] 🔄 2FA token entry failed, waiting ${timeout}ms before retrying...`);
                },  
            }
        );

        const authorizeButton = authorizeAppPage.getByRole('button', { name: 'authorize' });

        // Click authorize button if app is not authorized, skip otherwise
        try {
            await authorizeButton.waitFor({ state: 'visible', timeout: 3000 });
            await authorizeButton.click();
            console.log('Authorization button clicked successfully');
        } catch (error: unknown) {
            if (error instanceof Error && !error.message.includes('locator.waitFor')) {
                throw error;
            }
            console.log('Authorization button not found or not needed, continuing...');
        }
    }

    /**
     * Verifies the GitHub "View Source" link on the component page.
     * Checks that the link is visible, clickable, and accessible.
     *
     * @param page - Playwright Page object for UI interactions
     */
    async checkViewSourceLink(page: Page): Promise<void> {
        const githubLink = page.locator(`${GitPO.githubLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await expect(githubLink).toBeVisible({ timeout: 10000 });

        const linkHref = await githubLink.getAttribute('href');
        expect(githubLink).toBeTruthy();

        const isClickable = await githubLink.isEnabled();
        expect(isClickable).toBe(true);

        const response = await page.request.head(linkHref!);
        const status = response.status();
        expect(status).toBe(200);

        console.log(`GitHub URL: ${linkHref}`);
    }

    /**
     * Generates a 2FA token for GitHub authentication.
     * Uses the TOTP secret from environment variables.
     *
     * @returns Promise resolving to the generated 2FA token
     */
    private async getGitHub2FAOTP(): Promise<string> {
        const secret = loadFromEnv("GH_SECRET");
        const token = authenticator.generate(secret);
        return token;
    }

}

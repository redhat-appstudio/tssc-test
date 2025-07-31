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
        let button = page.getByRole('button', { name: DHLoginPO.signInButtonName });
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

        const token = await this.getGitHub2FAOTP();
        await authorizeAppPage.locator(GhLoginPO.github2FAField).fill(token);

    }

    /**
     * Verifies the GitHub "View Source" link on the component page.
     * Checks that the link is visible, clickable, and accessible.
     * 
     * @param page - Playwright Page object for UI interactions
     */
    async checkViewSourceLink(page: Page): Promise<void> {
        const githubLink = page.locator(`${GitPO.githubLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await githubLink.waitFor({ state: 'visible', timeout: 10000 });
        
        const linkHref = await githubLink.getAttribute('href');
        test.expect(githubLink).toBeTruthy();
        
        const isClickable = await githubLink.isEnabled();
        test.expect(isClickable).toBe(true);
        
        const response = await page.request.head(linkHref!);
        const status = response.status();
        test.expect(status).toBe(200);
        
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

/**
 * GitLab UI Plugin
 * 
 * Implements UI automation for GitLab-specific operations.
 * Handles GitLab login flow and authorization.
 */

import { GitPlugin } from './gitUiInterface';
import { Page } from '@playwright/test';
import { GitUi } from './gitUi';
import { GitPO } from '../../page-objects/commonPo';

export class GitlabUiPlugin extends GitUi implements GitPlugin  {
    async login(page: Page): Promise<void> {
        // Implement GitLab-specific login logic using page objects
        // This would typically involve OAuth flow or token-based authentication
        throw new Error('Method not implemented.');
    }

    async checkViewSourceLink(page: Page): Promise<void> {
        const gitlabLink = page.locator(`${GitPO.gitlabLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await this.checkGitLink(page, gitlabLink);
    }
}
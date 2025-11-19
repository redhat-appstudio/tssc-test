/**
 * Bitbucket UI Plugin
 * 
 * Implements UI automation for Bitbucket-specific operations.
 */

import { GitPlugin } from './gitUiInterface';
import { Page } from '@playwright/test';
import { GitUi } from './gitUi';
import { GitPO } from '../../page-objects/commonPo';

export class BitbucketUiPlugin extends GitUi implements GitPlugin  {
    async checkViewSourceLink(page: Page): Promise<void> {
        const bitbucketLink = page.locator(`${GitPO.bitbucketLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await this.checkGitLink(page, bitbucketLink);
    }
}
import { expect, Page } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { GitPO } from '../../page-objects/commonPo';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class GithubActionsPlugin extends BaseCIPlugin {
    private readonly logger: Logger = LoggerFactory.getLogger('GithubActionsPlugin');

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

        try {
            await githubPage.waitForLoadState('domcontentloaded');

            const actionsUrl = this.buildActionsUrl(repoUrl);
            await githubPage.goto(actionsUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });

            await expect(githubPage).toHaveURL(actionsUrl, { timeout: 20000 });
        } finally {
            await githubPage.close();
        }
    }

    /**
     * Builds the GitHub Actions URL from a repository URL.
     * Handles URLs with query parameters or fragments properly.
     *
     * @param repoUrl - The repository URL
     * @returns The Actions page URL
     */
    private buildActionsUrl(repoUrl: string): string {
        const url = new URL(repoUrl);
        // Remove any query parameters or fragments and append /actions
        const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
        return `${url.origin}${pathname}/actions`;
    }

    // eslint-disable-next-line no-unused-vars
    public async checkImageRegistryLinks(_page: Page): Promise<void> {
        this.logger.info('Skipping checkImageRegistryLinks - not applicable for GitHub Actions CI');
    }
}

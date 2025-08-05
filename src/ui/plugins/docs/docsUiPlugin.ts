import { expect, Page } from '@playwright/test';
import { checkWebsiteStatus } from '../../common';

export class DocsUiPlugin {
    private readonly componentName: string;
    private readonly sourceRepoUrl: string;
    private readonly gitOpsRepoUrl: string;

    constructor(
        componentName: string,
        sourceRepoUrl: string,
        gitOpsRepoUrl: string
    ) {
        this.componentName = componentName;
        this.sourceRepoUrl = sourceRepoUrl;
        this.gitOpsRepoUrl = gitOpsRepoUrl;
    }

    // Check article displays
    async checkArticle(page: Page): Promise<void> {
        await expect(page.getByRole('article').first()).toBeVisible();
    }

    // Check that the component name is visible
    async checkComponentName(page: Page): Promise<void> {
        await expect(page.getByRole('strong').filter({ hasText: this.componentName })).toBeVisible();
    }
    
    // Check that the source link is visible
    async checkSourceLink(page: Page): Promise<void> {
        const sourceLink = page.getByRole('link', { name: this.sourceRepoUrl }).first();
        await expect(sourceLink).toBeVisible();

        const href = await sourceLink.getAttribute('href');
        await checkWebsiteStatus(page, href!, 200);
    }

    // Check that the gitops link is visible
    async checkGitopsLink(page: Page): Promise<void> {
        const gitOpsLink = page.getByRole('link', { name: this.gitOpsRepoUrl }).first();
        await expect(gitOpsLink).toBeVisible();

        const href = await gitOpsLink.getAttribute('href');
        await checkWebsiteStatus(page, href!, 200);
    }
}

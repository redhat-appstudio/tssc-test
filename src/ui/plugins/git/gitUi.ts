import { expect, Locator, Page } from '@playwright/test';
import { Git } from '../../../rhtap/core/integration/git';

export class GitUi {
    private gitProvider: Git;

    constructor(
        git: Git
    ) {
        this.gitProvider = git;
    }

    protected async checkGitLink(page: Page, gitLink: Locator): Promise<void> {
        await expect(gitLink).toBeVisible();

        const linkHref = await gitLink.getAttribute('href');
        expect(gitLink).toBeTruthy();

        const isClickable = await gitLink.isEnabled();
        expect(isClickable).toBe(true);

        const response = await page.request.head(linkHref!);
        const status = response.status();
        expect(status).not.toBe(404);

        console.log(`Checked git link: ${linkHref}`);
    }
}

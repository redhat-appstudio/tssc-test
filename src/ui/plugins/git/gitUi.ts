import { expect, Locator, Page } from '@playwright/test';
import { Git } from '../../../rhtap/core/integration/git';
import { LoggerFactory } from '../../../logger/logger';
import type { Logger } from '../../../logger/logger';

export class GitUi {
    protected readonly logger: Logger;

    constructor(
        _git: Git
    ) {
        this.logger = LoggerFactory.getLogger(GitUi);
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

        this.logger.debug('Checked git link: {}', linkHref);
    }
}

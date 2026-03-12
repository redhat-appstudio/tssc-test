import { expect, Page } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { GitPO, CommonPO } from '../../page-objects/commonPo';
import { CiPo } from '../../page-objects/ciPo';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class GitlabCIPlugin extends BaseCIPlugin {
    private readonly logger: Logger = LoggerFactory.getLogger('GitlabCIPlugin');

    constructor(name: string, registryOrg: string) {
        super(name, registryOrg);
    }

    // eslint-disable-next-line no-unused-vars
    public async checkActions(_page: Page): Promise<void> {
        // GitLab CI pipeline runs are shown in the main table, no additional actions needed
    }

    public async checkPipelineRunsTable(page: Page): Promise<void> {
        const overviewUrl = page.url().replace(/\/ci(?:\?.*)?$/, '');
        await page.goto(overviewUrl, { timeout: 20000 });
        await page.waitForLoadState('domcontentloaded');

        const viewSourceLink = page.locator(`${GitPO.gitlabLinkSelector}:has-text("${GitPO.viewSourceLinkText}")`);
        await expect(viewSourceLink).toBeVisible({ timeout: 20000 });

        const repoUrl = await viewSourceLink.getAttribute('href');
        if (!repoUrl) {
            throw new Error('Missing repository URL on View Source link');
        }

        const gitlabPagePromise = page.context().waitForEvent('page', { timeout: 10000 });
        await viewSourceLink.click();
        const gitlabPage = await gitlabPagePromise;

        try {
            await gitlabPage.waitForLoadState('domcontentloaded');

            const pipelinesUrl = this.buildPipelinesUrl(repoUrl);
            await gitlabPage.goto(pipelinesUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });

            await expect(gitlabPage).toHaveURL(pipelinesUrl, { timeout: 20000 });
        } finally {
            await gitlabPage.close();
        }
    }

    private buildPipelinesUrl(repoUrl: string): string {
        const url = new URL(repoUrl);
        const pathname = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
        return `${url.origin}${pathname}/-/pipelines`;
    }

    // eslint-disable-next-line no-unused-vars
    public async checkImageRegistryLinks(_page: Page): Promise<void> {
        this.logger.info('Skipping checkImageRegistryLinks - not applicable for GitLab CI');
    }

    public async checkSecurityInformation(page: Page): Promise<void> {
        // Check the Security Information heading is visible
        const heading = page.getByRole('heading', { name: CiPo.securityInformationHeading });
        await expect(heading).toBeVisible({ timeout: 10000 });

        // Check the "Gitlab CI" tab is visible in the Multi CI tablist
        const gitlabTab = page.getByRole('tab', { name: CiPo.gitlabCITabName });
        await expect(gitlabTab).toBeVisible();

        // Check the vulnerability table column headers are present
        for (const column of CiPo.securityTableColumns) {
            await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
        }

        // Check the table has at least one data row
        const table = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Pipeline Run ID' }) });
        const rows = table.locator('tbody tr').filter({ has: page.getByRole('cell') });
        await expect(rows.first()).toBeVisible({ timeout: 15000 });
        const rowCount = await rows.count();
        this.logger.info(`Security Information table has ${rowCount} data row(s)`);

        // Find a row with Type "Build" (don't assume ordering)
        const buildRow = rows.filter({ has: page.getByRole('cell', { name: 'Build', exact: true }) });
        await expect(buildRow.first()).toBeVisible({ timeout: 5000 });

        const pipelineRunId = await buildRow.first().getByRole('cell').first().innerText();
        expect(pipelineRunId).toBeTruthy();
        this.logger.info(`First Build pipeline run ID: ${pipelineRunId}`);

        // Open View Logs dialog and verify its content
        const viewLogsButton = buildRow.first().getByTestId(CiPo.viewLogsButtonTestId);
        await viewLogsButton.click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 10000 });

        // Verify the dialog heading contains the pipeline run ID
        const dialogHeading = dialog.getByRole('heading');
        await expect(dialogHeading).toContainText(pipelineRunId);

        // Close the dialog
        const closeButton = dialog.getByTestId(CommonPO.closeIconTestId);
        await closeButton.click();
        await expect(dialog).not.toBeVisible({ timeout: 5000 });

        this.logger.info('Security Information verification completed for GitLab CI');
    }
}

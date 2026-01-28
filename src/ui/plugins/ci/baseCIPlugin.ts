import { escapeRegex } from '../../../utils/util';
import { CiPo } from '../../page-objects/ciPo';
import { CommonPO } from '../../page-objects/commonPo';
import { CIPlugin } from './ciPlugin';
import { expect, Locator, Page } from '@playwright/test';
import { AcsPO } from '../../page-objects/acsPo';

export class BaseCIPlugin implements CIPlugin {
    protected name: string;
    private imageUrlRegex: RegExp;

    constructor(name: string, registryOrg: string) {
        this.name = name;
        this.imageUrlRegex = new RegExp(`^${escapeRegex(registryOrg)}/`, 'i');
    }

    public async checkCIHeading(page: Page): Promise<void> {
        // For GitHub Actions, the name appears as a tab in Security Information, not a heading
        const heading = page.getByRole('heading', { name: this.name });
        const tab = page.getByRole('tab', { name: this.name });

        // Check if either heading or tab is visible
        const headingVisible = await heading.isVisible().catch(() => false);
        const tabVisible = await tab.isVisible().catch(() => false);

        if (!headingVisible && !tabVisible) {
            // Fallback: check for "Github Actions" tab (different casing)
            const tabAlt = page.getByRole('tab', { name: 'Github Actions' });
            await expect(tabAlt).toBeVisible({ timeout: 10000 });
        }
    }

    protected async checkImageScanTable(page: Locator): Promise<void> {
        // Check the titles are visible
        for (const titleName of [AcsPO.cvesBySeverityTitle, AcsPO.cvesByStatusTitle, AcsPO.totalScanResultsTitle]) {
            const title = page.getByText(titleName, { exact: true }).first();
            await expect(title).toBeVisible();
        }

        // Check the ACS vulnerability scan message is visible
        const acsVulnerabilityScanMessage = page.getByText(AcsPO.imageScanMessage);
        await expect(acsVulnerabilityScanMessage).toBeVisible();

        // Check the image url is visible
        await expect(page.getByText(this.imageUrlRegex)).toBeVisible();

        // Check the table is visible
        const table = page.getByTestId(AcsPO.imageScanTableTestId);
        await expect(table).toBeVisible();  
    }

    protected async checkImageCheckTable(page: Locator): Promise<void> {
        for (const titleName of [AcsPO.cvesBySeverityTitle, AcsPO.failingPolicyChecksTitle]) {
            const title = page.getByText(titleName, { exact: true }).first();
            await expect(title).toBeVisible();
        }

        // Check the ACS vulnerability image check message is visible
        const acsVulnerabilityScanMessage = page.getByText(AcsPO.imageCheckMessage);
        await expect(acsVulnerabilityScanMessage).toBeVisible();

        // Check the image url is visible
        await expect(page.getByText(this.imageUrlRegex)).toBeVisible();

        // Check the table is visible
        const table = page.getByTestId(AcsPO.imageCheckTableTestId);
        await expect(table).toBeVisible();
    }

    protected async checkDeploymentCheckTable(page: Locator): Promise<void> {
        // Check the titles are visible
        for (const titleName of [AcsPO.violationsBySeverityTitle, AcsPO.failingPolicyChecksTitle]) {
            const title = page.getByText(titleName, { exact: true }).first();
            await expect(title).toBeVisible();
        }

        // Check the ACS vulnerability deployment check message is visible
        const acsDeploymentCheckMessage = page.getByText(`${AcsPO.deploymentCheckMessagePrefix} ${this.name}`);
        await expect(acsDeploymentCheckMessage).toBeVisible();

        // Check the table is visible
        const table = page.getByTestId(AcsPO.deploymentCheckTableTestId);
        await expect(table).toBeVisible();
    }

    protected async checkViewOutputPopup(page: Page, row: Locator): Promise<void> {
        const viewOutputButton = row.getByTestId(CommonPO.viewOutputIconTestId);
        await viewOutputButton.click();

        const acsTitle = page.locator(`div[data-testid="${AcsPO.cardTitleTestId}"]`).first();
        await expect(acsTitle).toBeVisible();

        const visiblePanel = page.locator(AcsPO.visibleTabPanelSelector);
        await expect(visiblePanel).toBeVisible();

        const imageScanTabButton = page.getByRole('tab', { name: CiPo.imageScanTabName });
        await imageScanTabButton.click();
        await this.checkImageScanTable(visiblePanel);

        const imageCheckTabButton = page.getByRole('tab', { name: CiPo.imageCheckTabName });
        await imageCheckTabButton.click();
        await this.checkImageCheckTable(visiblePanel);

        const deploymentCheckTabButton = page.getByRole('tab', { name: CiPo.deploymentCheckTabName });
        await deploymentCheckTabButton.click();
        await this.checkDeploymentCheckTable(visiblePanel);

        const closeButton = page.getByRole('dialog').getByTestId(CommonPO.closeIconTestId);
        await closeButton.click();
    }

    // eslint-disable-next-line no-unused-vars
    public async checkActions(_page: Page): Promise<void> {
    }

    // eslint-disable-next-line no-unused-vars
    public async checkPipelineRunsTable(_page: Page): Promise<void> {
    }
}

import { expect, Locator, Page } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { checkWebsiteStatus } from '../../commonUi';
import { AzurePO } from '../../page-objects/azurePo';
import { CiPo } from '../../page-objects/ciPo';
import { CommonPO } from '../../page-objects/commonPo';

export class AzurePlugin extends BaseCIPlugin {
    constructor(name: string, registryOrg: string) {
        super(name, registryOrg);
    }

    private getPprTable(page: Page): Locator {
        return page.locator('table').filter({ 
            has: page.getByRole('columnheader', { name: AzurePO.columnHeaders[0], exact: true }) 
        });
    }

    private async checkColumnHeaders(table: Locator): Promise<void> {
        for (const header of AzurePO.columnHeaders) {
            await expect(table.getByRole('columnheader', { name: header })).toBeVisible();
        }
    }

    private async checkRowCellsVisible(cells: Locator[]): Promise<void> {
        expect(cells).toHaveLength(AzurePO.columnHeaders.length);
        for (const cell of cells) {
            await expect(cell).toBeVisible();
        }
    }

    private async checkRowCellContents(page: Page, cells: Locator[]): Promise<void> {
        const { cellIndex } = AzurePO;

        await expect(cells[cellIndex.id]).toHaveText(AzurePO.pprNumberRegex);

        const pprLink = cells[cellIndex.build].getByRole('link');
        await expect(pprLink).toBeVisible();
        const pprLinkHref = await pprLink.getAttribute('href');
        expect(pprLinkHref).not.toBeNull();
        await checkWebsiteStatus(page, pprLinkHref!);

        await expect(cells[cellIndex.source]).toHaveText(AzurePO.branchCommitRegex);

        await expect(cells[cellIndex.state].getByTestId(CiPo.statusOkTestId)).toBeVisible();
        await expect(cells[cellIndex.state]).toContainText(CiPo.statusSucceededText);

        await expect(cells[cellIndex.duration]).toHaveText(AzurePO.durationRegex);

        await expect(cells[cellIndex.age]).toHaveText(AzurePO.relativeTimeRegex);

        await expect(cells[cellIndex.logs].getByRole('button', { name: AzurePO.viewLogsButtonName })).toBeVisible();
    }

    public async checkCIHeading(page: Page): Promise<void> {
        await expect(page.getByRole('heading', { name: AzurePO.pipelinesHeading })).toBeVisible();
    }

    public async checkActions(page: Page): Promise<void> {
        const pipelineRunsTable = this.getPprTable(page);
        const firstRow = pipelineRunsTable.locator(CommonPO.dataRowSelector).first();
        
        const viewLogsButton = firstRow.getByRole('button', { name: AzurePO.viewLogsButtonName });
        await expect(viewLogsButton).toBeVisible();
        await viewLogsButton.click();

        const logsPopup = page.getByRole('heading', { name: AzurePO.logsPopupHeadingRegex });
        await expect(logsPopup).toBeVisible();

        const closeButton = page.getByRole('button', { name: AzurePO.closeButtonName });
        await closeButton.click();
    }

    public async checkPipelineRunsTable(page: Page): Promise<void> {
        const pipelineRunsTable = this.getPprTable(page);
        await expect(pipelineRunsTable).toBeVisible();

        await this.checkColumnHeaders(pipelineRunsTable);
        
        const tableRows = pipelineRunsTable.locator(CommonPO.dataRowSelector);
        await expect(tableRows.first()).toBeVisible();

        const tableRowCells = await tableRows.first().locator('td').all();
        await this.checkRowCellsVisible(tableRowCells);
        await this.checkRowCellContents(page, tableRowCells);
    }
}

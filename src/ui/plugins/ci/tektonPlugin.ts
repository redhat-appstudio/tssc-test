import { expect, Page, Locator } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { TektonPO } from '../../page-objects/tektonPo';
import { CommonPO } from '../../page-objects/commonPo';

export class TektonPlugin extends BaseCIPlugin {
    constructor(name: string, registryOrg: string) {
        super(name, registryOrg);
    }

    private async checkActionButtons(onPushRow: Locator): Promise<void> {
        for (const testId of [TektonPO.logsIconTestId, TektonPO.internalSbomLinkTestId, TektonPO.viewOutputTestId]) {
            const button = onPushRow.getByTestId(testId);
            await expect(button).toBeVisible();
        }
    }

    private async checkLogsPopup(page: Page, row: Locator): Promise<void> {
        const logsButton = row.getByTestId(TektonPO.logsIconTestId);
        await logsButton.click();

        const logsPopup = page.getByTitle(TektonPO.logsDialogTitle);
        await expect(logsPopup).toBeVisible();

        for (const task of TektonPO.sourceTasks) {
            const button = page.getByRole('heading', { name: task });
            await expect(button).toBeVisible();
        }

        const button = page.getByRole('heading', { name: TektonPO.sourceTasks[0] });
        await button.click();

        // Check the log is visible by looking for the word 'STEP'
        const span = page.getByText(TektonPO.logStepRegex);
        await expect(span).toBeVisible();

        // Close popup
        const closeButton = page.getByRole('dialog').getByTestId(CommonPO.closeIconTestId);
        await closeButton.click();
    }

    async checkSBOMpopup(page: Page, row: Locator): Promise<void> {
        const sbomButton = row.getByTestId(TektonPO.internalSbomLinkTestId);
        await sbomButton.click();

        const searchBox = page.getByRole('textbox', { name: TektonPO.searchBoxName });
        await searchBox.fill(TektonPO.sbomStepName);

        const span = page.getByText(TektonPO.sbomStepName);
        await expect(span).toBeVisible();

        // Close popup
        const closeButton = page.getByRole('dialog').getByTestId(CommonPO.closeIconTestId);
        await closeButton.click();
    }

    private async checkGraph(page: Page, row: Locator): Promise<void> {
        const expandButton = row.getByRole('button', { name: TektonPO.expandButtonName });
        const graph = page.locator(TektonPO.graphSelector);

        // Expand the row
        await expandButton.click();

        // Check the graph is visible
        await expect(graph).toBeVisible();

        // Fit to screen
        await page.getByRole('button', { name: TektonPO.fitToScreenButtonName }).click();

        // Check all the tasks are visible
        for (const taskName of TektonPO.sourceTasks) {
            const task = page.locator(`g[data-test="task ${taskName}"]`);
            await expect(task).toBeVisible();
        }

        // Check the graph buttons are visible
        for(const buttonName of [TektonPO.zoomInButtonName, TektonPO.zoomOutButtonName, TektonPO.fitToScreenButtonName, TektonPO.resetViewButtonName]) {
            const button = page.getByRole('button', { name: buttonName });
            await expect(button).toBeVisible();
        }

        // Collapse the row
        await expandButton.click();

        await expect(graph).not.toBeVisible();
    }

    async checkActions(page: Page): Promise<void> {
        // Scroll to the action column header to make action buttons visible
        await page.getByRole('columnheader', { name: TektonPO.actionsColumnHeader }).scrollIntoViewIfNeeded();

        const onPushRow = page.locator('tr').filter({ hasText: TektonPO.onPushRowRegex }).first();

        await this.checkActionButtons(onPushRow);
        await this.checkLogsPopup(page, onPushRow);
        await this.checkSBOMpopup(page, onPushRow);
        await this.checkViewOutputPopup(page, onPushRow);
        await this.checkGraph(page, onPushRow);
    }
}

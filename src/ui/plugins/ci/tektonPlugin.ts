import { expect, Page, Locator } from '@playwright/test';
import { BaseCIPlugin } from './baseCIPlugin';
import { TektonPO } from '../../page-objects/tektonPo';
import { CiPo } from '../../page-objects/ciPo';
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

    async checkPipelineRunsTable(page: Page): Promise<void> {
        // Wait for the Pipeline Runs section to be visible
        await expect(page.getByRole('heading', { name: /pipeline runs/i })).toBeVisible();

        // Find the table and on-push row
        const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'NAME' }) });
        const firstRow = table.locator('tbody tr').filter({ hasText: TektonPO.onPushRowRegex }).first();
        await expect(firstRow).toBeVisible();

        // 1. Shield icon next to name (look for shield icon with specific path, not the expand arrow)
        const shieldIcon = firstRow.locator('.signed-indicator svg');
        await expect(shieldIcon).toBeVisible();

        // 2. Vulnerabilities are shown (look for vulnerability severity levels)
        await expect(firstRow.getByRole('cell').filter({ hasText: TektonPO.vulnerabilitySeverityRegex }).first()).toBeVisible();

        // 3. Status is Succeeded and has a tick
        await expect(firstRow).toContainText(CiPo.statusSucceededText);
        await expect(firstRow.locator(`[data-testid="${CiPo.statusOkTestId}"]`)).toBeVisible();

        // 4. Started column has a date and time format (look for date pattern in any cell)
        await expect(firstRow.getByRole('cell').filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{4}/ })).toBeVisible();

        // 5. Task status has a visible bar (look for progress elements)
        await expect(firstRow.locator('[role="progressbar"], [class*="bar"], [data-testid*="progress"]').first()).toBeVisible();

        // 6. Duration is visible (`{number} minutes {number} seconds`)
        await expect(firstRow.getByRole('cell').filter({ hasText: TektonPO.durationRegex })).toBeVisible();
    }

    async checkActions(page: Page): Promise<void> {
        // Find the Pipeline Runs table specifically to avoid conflicts with other tables (e.g., ArgoCD)
        const pipelineRunsTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'NAME' }) });

        // Scroll to the action column header within the Pipeline Runs table
        await pipelineRunsTable.getByRole('columnheader', { name: TektonPO.actionsColumnHeader, exact: true }).scrollIntoViewIfNeeded();

        const onPushRow = pipelineRunsTable.locator('tr').filter({ hasText: TektonPO.onPushRowRegex }).first();

        await this.checkActionButtons(onPushRow);
        await this.checkLogsPopup(page, onPushRow);
        await this.checkSBOMpopup(page, onPushRow);
        await this.checkViewOutputPopup(page, onPushRow);
        await this.checkGraph(page, onPushRow);
    }
}

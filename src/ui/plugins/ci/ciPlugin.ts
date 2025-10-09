/* eslint-disable no-unused-vars */
import { Page } from '@playwright/test';

export interface CIPlugin {
    /**
     * Check that the CI heading is visible
     * @param page - The page object
     */
    checkCIHeading(page: Page): Promise<void>;

    /**
     * Check that the table content is visible
     * @param page - The page object
     */
    checkActions(page: Page): Promise<void>;

    /**
     * Check Pipeline Runs table row values
     * @param page - The page object
     */
    checkPipelineRunsTable(page: Page): Promise<void>;
}

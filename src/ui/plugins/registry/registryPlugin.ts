import { Page } from '@playwright/test';

export interface RegistryPlugin {
    /**
     * Checks repository heading
     * @param page - The page object
     */
    checkRepositoryHeading(page: Page): Promise<void>;

    /**
     * Checks repository link
     * @param page - The page object
     */
    checkRepositoryLink(page: Page): Promise<void>;

    /**
     * Checks image table content
     * @param page - The page object
     */
    checkImageTableContent(page: Page): Promise<void>;

    /**
     * Checks search input field visibility and search functionality
     * @param page - The page object
     */
    checkSearchInputField(page: Page): Promise<void>;

    /**
     * Checks table column headers
     * @param page - The page object
     */
    checkTableColumnHeaders(page: Page): Promise<void>;
}

import { expect, Locator, Page } from '@playwright/test';
import { ImageRegistry } from '../../../rhtap/core/integration/registry/imageRegistry';
import { RegistryPlugin } from './registryPlugin';
import { RegistryPO } from '../../page-objects/registryPo';

/**
 * Base class for registry UI plugins containing common functionality
 * that can be shared across different registry plugins.
 */
export abstract class BaseRegistryPlugin implements RegistryPlugin {
    protected registry: ImageRegistry;

    constructor(registry: ImageRegistry) {
        this.registry = registry;
    }

    private async getTableRows(page: Page): Promise<Locator[]> {
        return await page.locator('tr[index]').all();
    }

    async checkSearchInputField(page: Page): Promise<void> {
        const searchInput = page.getByRole('textbox', { name: RegistryPO.searchPlaceholder });
        const clearButton = page.getByRole('button', { name: RegistryPO.clearSearchButtonLabel });

        await expect(searchInput).toBeVisible();
        await expect(clearButton).toBeVisible();

        // Get all rows with indexes (relevant non-empty rows with index)
        const indexedRowsBefore = await this.getTableRows(page);
        const initialRowCount = indexedRowsBefore.length;
        
        await searchInput.fill('.att');
        await page.waitForTimeout(100);
        await expect(clearButton).toBeEnabled();

        // Get indexed rows after filtering
        const indexedRowsAfter = await this.getTableRows(page);
        expect(indexedRowsAfter.length).toBeGreaterThan(0);

        indexedRowsAfter.forEach(async (row) => {
            const rowText = await row.textContent();
            expect(rowText).toContain('.att');
        });

        // Click the clear search button
        await clearButton.click();
        await page.waitForTimeout(100);

        // Verify all indexed rows return after clearing
        const indexedRowsAfterClear = await page.locator('tr[index]').all();
        expect(indexedRowsAfterClear.length).toBe(initialRowCount);
    }

    async checkImageTableContent(page: Page): Promise<void> {
        const rows = await this.getTableRows(page);
        expect(rows.length).toBeGreaterThan(0);
    }

    // Abstract methods that must be implemented by specific registry plugins
    // eslint-disable-next-line no-unused-vars
    abstract checkRepositoryHeading(page: Page): Promise<void>;
    // eslint-disable-next-line no-unused-vars
    abstract checkRepositoryLink(page: Page): Promise<void>;
    // eslint-disable-next-line no-unused-vars
    abstract checkTableColumnHeaders(page: Page): Promise<void>;
}

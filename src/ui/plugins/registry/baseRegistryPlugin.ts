import { expect, Page } from '@playwright/test';
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

    async checkSearchInputField(page: Page): Promise<void> {
        const searchInput = page.getByRole('textbox', { name: RegistryPO.searchPlaceholder });
        await expect(searchInput).toBeVisible();

        // Get all rows with indexes (relevant non-empty rows with index)
        const indexedRowsBefore = await page.locator('tr[index]').all();
        const initialRowCount = indexedRowsBefore.length;
        
        await searchInput.fill('.att');
        await page.waitForTimeout(500);
        
        // Get indexed rows after filtering
        const indexedRowsAfter = await page.locator('tr[index]').all();
        const filteredRowCount = indexedRowsAfter.length;
        
        expect(filteredRowCount).toBeLessThan(initialRowCount);
        
        // Verify that visible rows contain the search term
        const visibleCells = await page.getByRole('cell').allTextContents();
        const hasAttestationResults = visibleCells.some(cell => cell.includes('.att'));
        expect(hasAttestationResults).toBe(true);
        
        // Clean the search input
        await searchInput.clear();
        await page.waitForTimeout(500);
        
        // Verify all indexed rows return after clearing
        const indexedRowsAfterClear = await page.locator('tr[index]').all();
        expect(indexedRowsAfterClear.length).toBe(initialRowCount);
    }

    async checkTableColumnHeaders(page: Page): Promise<void> {
        await expect(page.getByRole('columnheader', { name: RegistryPO.tagColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.lastModifiedColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.securityScanColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.sizeColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.expiresColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.manifestColumnHeader })).toBeVisible();
    }

    async checkImageTableContent(page: Page): Promise<void> {
        const cells = await page.getByRole('cell').all();
        for (const cell of cells) {
            await expect(cell).toBeVisible();
        }

        const cellNames = await Promise.all(cells.map(cell => cell.textContent()));
        expect(cellNames.find(cell => cell?.match(/\.att/))).toBeDefined();
        expect(cellNames.find(cell => cell?.match(/\.sig/))).toBeDefined();
        expect(cellNames.find(cell => cell?.match(/\.sbom/))).toBeDefined();
        expect(cellNames.find(cell => cell?.match(new RegExp(`^${this.registry.getImageName()}`)))).toBeDefined();
    }

    // Abstract methods that must be implemented by specific registry plugins
    abstract checkRepositoryHeading(page: Page): Promise<void>;
    abstract checkRepositoryLink(page: Page): Promise<void>;
}

import { expect, Page } from '@playwright/test';
import { ImageRegistry } from '../../../rhtap/core/integration/registry/imageRegistry';
import { BaseRegistryPlugin } from "./baseRegistryPlugin";
import { RegistryPO } from "../../page-objects/registryPo";

export class QuayUiPlugin extends BaseRegistryPlugin {
    private quayProvider: ImageRegistry;

    constructor(registry: ImageRegistry) {
        super(registry);
        this.quayProvider = registry;
    }

    async checkRepositoryHeading(page: Page): Promise<void> {
        await expect(page.getByRole('heading', { name: `${RegistryPO.quayRepositoryPrefix} tssc/${this.quayProvider.getImageName()}` })).toBeVisible();
    }

    async checkRepositoryLink(page: Page): Promise<void> {
        await expect(page.getByRole('link', { name: `tssc/${this.quayProvider.getImageName()}` })).toBeVisible();

        const quayPopup = page.waitForEvent('popup');
        await page.locator('a[class*="MuiLink-root"]').filter({ hasText: `tssc/${this.quayProvider.getImageName()}` }).click();
        const popup = await quayPopup;
        await expect(popup).toBeTruthy();

        await popup.waitForLoadState('networkidle');
        const popupUrl = popup.url();
        expect(popupUrl).toContain('quay');
        
        // Close the popup for cleanup
        await popup.close();
    }
}
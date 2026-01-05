import { expect, Page } from '@playwright/test';
import { ImageRegistry } from '../../../rhtap/core/integration/registry/imageRegistry';
import { BaseRegistryPlugin } from "./baseRegistryPlugin";
import { RegistryPO } from "../../page-objects/registryPo";

export class QuayUiPlugin extends BaseRegistryPlugin {

    constructor(registry: ImageRegistry) {
        super(registry);
    }

    async checkRepositoryHeading(page: Page): Promise<void> {
        await expect(page.getByRole('heading', { name: `${RegistryPO.quayRepositoryPrefix} ${this.registry.getOrganization()}/${this.registry.getImageName()}` })).toBeVisible();
    }

    async checkRepositoryLink(page: Page): Promise<void> {
        const repositoryLink = `${this.registry.getOrganization()}/${this.registry.getImageName()}`;

        await expect(page.getByRole('link', { name: repositoryLink })).toBeVisible();
    }

    async checkTableColumnHeaders(page: Page): Promise<void> {
        await expect(page.getByRole('columnheader', { name: RegistryPO.tagColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.lastModifiedColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.securityScanColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.sizeColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.expiresColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.manifestColumnHeader })).toBeVisible();
    }

    async checkVulnerabilities(page: Page): Promise<void> {
        const searchInput = page.getByRole('textbox', { name: RegistryPO.searchPlaceholder });
        await searchInput.fill('build-container');

        // Click on the vulnerabilities scan link (any vulnerability counts)
        const vulnerabilitiesLink = page.getByRole('link', { name: /(Critical|High|Medium|Low):\s*\d+/ }).first();
        await expect(vulnerabilitiesLink).toBeVisible();
        await vulnerabilitiesLink.click();
        
        // Check that the vulnerabilities heading is visible
        const vulnerabilitiesHeading = page.getByRole('heading', { name: /Vulnerabilities for .+/ });
        await expect(vulnerabilitiesHeading).toBeVisible();

        // Check that the vulnerabilities table headers are visible
        await expect(page.getByRole('columnheader', { name: RegistryPO.advisoryColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.severityColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.packageNameColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.currentVersionColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.fixedByColumnHeader })).toBeVisible();

        // Close the vulnerabilities popup
        const goBackButton = page.getByRole('link', { name: RegistryPO.backToRepositoryLinkLabel });
        await expect(goBackButton).toBeVisible();
        await goBackButton.click();

        // Check that the repository link is visible
        const repositoryLink = `${this.registry.getOrganization()}/${this.registry.getImageName()}`;
        await expect(page.getByRole('link', { name: repositoryLink })).toBeVisible();
    }
}

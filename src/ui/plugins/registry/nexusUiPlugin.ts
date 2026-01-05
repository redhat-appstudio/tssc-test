import { expect, Page } from '@playwright/test';
import { ImageRegistry } from '../../../rhtap/core/integration/registry/imageRegistry';
import { BaseRegistryPlugin } from "./baseRegistryPlugin";
import { RegistryPO } from "../../page-objects/registryPo";

export class NexusUiPlugin extends BaseRegistryPlugin {

    constructor(registry: ImageRegistry) {
        super(registry);
    }

    async checkRepositoryHeading(page: Page): Promise<void> {
        await expect(page.getByRole('heading', { name: `${RegistryPO.nexusRepositoryPrefix} ${this.registry.getOrganization()}/${this.registry.getImageName()}` })).toBeVisible();
    }

    // eslint-disable-next-line no-unused-vars
    async checkRepositoryLink(_page: Page): Promise<void> {
        // Skipped: Nexus repository link is not supported yet
    }

    async checkTableColumnHeaders(page: Page): Promise<void> {
        await expect(page.getByRole('columnheader', { name: RegistryPO.versionColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.artifactColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.repositoryTypeColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.checksumColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.modifiedColumnHeader })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: RegistryPO.sizeColumnHeader })).toBeVisible();
    }
}

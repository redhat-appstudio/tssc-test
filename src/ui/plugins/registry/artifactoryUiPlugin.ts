import { expect, Page } from '@playwright/test';
import { ImageRegistry } from '../../../rhtap/core/integration/registry/imageRegistry';
import { BaseRegistryPlugin } from "./baseRegistryPlugin";
import { RegistryPO } from "../../page-objects/registryPo";

export class ArtifactoryUiPlugin extends BaseRegistryPlugin {

    constructor(registry: ImageRegistry) {
        super(registry);
    }

    async checkRepositoryHeading(page: Page): Promise<void> {
        await expect(page.getByRole('heading', { name: `${RegistryPO.artifactoryRepositoryPrefix} ${this.registry.getImageName()}` })).toBeVisible();
    }

    // eslint-disable-next-line no-unused-vars
    async checkRepositoryLink(_page: Page): Promise<void> {
        // Skipped: Artifactory repository link is not supported yet
    }

    async checkTableColumns(page: Page): Promise<void> {
        await this.checkTableColumnHeaders(page, [
            RegistryPO.versionColumnHeader,
            RegistryPO.repositoriesColumnHeader,
            RegistryPO.manifestColumnHeader,
            RegistryPO.modifiedColumnHeader,
            RegistryPO.sizeColumnHeader,
        ]);
    }
}

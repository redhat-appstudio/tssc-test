import { expect, Page } from '@playwright/test';
import { DependenciesPO } from '../../page-objects/dependencies_po';
import { waitForPageLoad } from '../../common';

export class DependenciesUiPlugin {
    private readonly componentName: string;

    constructor(
        componentName: string,
    ) {
        this.componentName = componentName;
    }

    async checkAllBoxesPresent(page: Page) {
        for (const title of DependenciesPO.titles) {
            await expect(page.getByRole('heading', { name: title })).toBeVisible();
        }
    }

    async checkRelationsTitle(page: Page) {
        await expect(page.getByText( DependenciesPO.relationsTitle )).toBeVisible();
      }

    async checkNodesPresent(page: Page) {
        const componentNode = page.getByTestId('node').filter({ has: page.getByText(this.componentName, { exact: true }) });
        await expect(componentNode).toBeVisible();
        await expect(page.getByTestId("node").filter({ hasText: `${this.componentName}-gitops` })).toBeVisible();
    }

    async goToGitopsDependency(page: Page) {
        const nodeLocator = page.getByTestId("node").filter({ hasText: `${this.componentName}-gitops` });
        await expect(nodeLocator).toBeVisible();
        await nodeLocator.click();
        await waitForPageLoad(page, `${this.componentName}-gitops`);
    }
}

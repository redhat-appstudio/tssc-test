import { expect, Page } from '@playwright/test';
import { DependenciesPO } from '../../page-objects/dependencies_po';

export class DependenciesUiPlugin {
    private readonly componentName: string;
    private readonly sourceRepoUrl: string;
    private readonly gitOpsRepoUrl: string;

    constructor(
        componentName: string,
        sourceRepoUrl: string,
        gitOpsRepoUrl: string
    ) {
        this.componentName = componentName;
        this.sourceRepoUrl = sourceRepoUrl;
        this.gitOpsRepoUrl = gitOpsRepoUrl;
    }

    async checkAllBoxesPresent(page: Page) {
        for (const title of DependenciesPO.titelsArray) {
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
        await expect(page.getByRole('heading', { name: this.componentName })).toBeVisible();
    }
}

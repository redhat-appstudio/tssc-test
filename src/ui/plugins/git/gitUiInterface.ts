import { Page } from "@playwright/test";

export interface GitPlugin {
    /**
     * Verifies the Git "View Source" link on the component page.
     * 
     * @param page - Playwright Page object for UI interactions
     */
    checkViewSourceLink(page: Page): Promise<void>;
}

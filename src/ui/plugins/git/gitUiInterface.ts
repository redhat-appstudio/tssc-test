import { Page } from "@playwright/test";

export interface GitPlugin {
    /**
     * Performs Git login through the Developer Hub UI.
     * 
     * @param page - Playwright Page object for UI interactions
     */
    login(page: Page): Promise<void>;

    /**
     * Verifies the Git "View Source" link on the component page.
     * 
     * @param page - Playwright Page object for UI interactions
     */
    checkViewSourceLink(page: Page): Promise<void>;
}

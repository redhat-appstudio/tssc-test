import { Page } from "@playwright/test";

export interface AuthUi {
    /**
     * Performs login through the Developer Hub UI.
     * 
     * @param page - Playwright Page object for UI interactions
     */
    login(page: Page): Promise<void>;
}

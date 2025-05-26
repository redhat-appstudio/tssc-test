/**
 * Git UI Plugin Interface
 * 
 * Defines the contract for Git provider UI automation implementations.
 * All Git UI plugins must implement this interface to ensure consistent
 * UI automation capabilities across different Git providers.
 */

import { Page } from "@playwright/test";

export interface GitPlugin {
    /**
     * Performs login through the Developer Hub UI for the specific Git provider.
     * 
     * @param page - Playwright Page object for UI interactions
     */
    login(page: Page): Promise<void>;
}   
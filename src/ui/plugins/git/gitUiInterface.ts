import { Page } from "@playwright/test";

export interface GitPlugin {
    login(page: Page): Promise<void>;
}

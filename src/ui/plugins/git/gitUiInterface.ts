import { Page } from "@playwright/test";

export interface GitPlugin {
    login(page: Page): Promise<void>;
    checkViewSourceLink(page: Page): Promise<void>;
}

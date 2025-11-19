/**
 * OIDC UI
 * 
 * Handles OIDC authentication flows
 */

import { expect, Page } from '@playwright/test';
import { AuthUi } from './authUi';
import { DHLoginPO } from '../../page-objects/loginPo';
import { KubeClient } from '../../../api/ocp/kubeClient';
import { AuthPo } from '../../page-objects/authPo';
import { blurLocator } from '../../commonUi';

export class OidcUi implements AuthUi {
    private kubeClient: KubeClient;

    constructor() {
        this.kubeClient = new KubeClient();
    }

    async login(page: Page): Promise<void> {
        // Get sign in button
        const signInButton = page.getByRole('button', { name: DHLoginPO.signInButtonName });
        await expect(signInButton).toBeVisible({ timeout: 15000 });

        // Catch OIDC login popup
        const popupPromise: Promise<Page | null> = page.context().waitForEvent('page', { timeout: 10000 }).then(p => p as Page).catch(() => null);
        await signInButton.click();
        const oidcPopup = await popupPromise;
        if (!oidcPopup) {
            throw new Error('OIDC login popup is not found.');
        }

        // Get OIDC login credentials
        const secret = await this.kubeClient.getSecret(AuthPo.oidcAdminUserSecretName, AuthPo.oidcAdminUserSecretNamespace);
        const username = secret[AuthPo.oidcAdminUserUsernameKey];
        const password = secret[AuthPo.oidcAdminUserPasswordKey];

        // Get login fields
        const usernameField = oidcPopup.getByRole('textbox', { name: AuthPo.usernameField });
        const passwordField = oidcPopup.getByRole('textbox', { name: AuthPo.passwordField });
        const loginButton = oidcPopup.getByRole('button', { name: AuthPo.signInButton });

        // Wait for fields to be visible
        await expect(usernameField).toBeVisible();
        await expect(passwordField).toBeVisible();
        await expect(loginButton).toBeVisible();

        // Fill in credentials and click login button
        await blurLocator(usernameField);
        await usernameField.fill(username);
        await blurLocator(passwordField);
        await passwordField.fill(password);
        await loginButton.click();
    }
}

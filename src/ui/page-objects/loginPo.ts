/**
 * Developer Hub Login Page Objects
 * Contains locators for Developer Hub login elements
 */
export class DHLoginPO {
    static readonly signInButtonName = /Sign In|Log In/i;
}

/**
 * GitHub Login Page Objects
 * Contains locators for GitHub-specific login form elements
 */
export class GhLoginPO {
    static readonly githubLoginField = '#login_field';
    static readonly githubPasswordField = '#password';
    static readonly githubSignInButton = '[value="Sign in"]';
    static readonly github2FAField = '#app_totp';
} 
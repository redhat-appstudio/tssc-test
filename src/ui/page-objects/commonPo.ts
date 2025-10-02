/**
 * Common Page Objects
 * 
 * Contains locators and constants for UI elements that are shared
 * across multiple pages in the Developer Hub.
 */

export const CommonPO = {
    // Titles and headings
    welcomeTitle: 'Welcome back!',

    // Test IDs
	viewOutputIconTestId: 'view-output-icon',
    closeIconTestId: 'CloseIcon',

} 

/**
 * Git-related Page Objects
 * 
 * Contains locators for Git provider UI elements (GitHub, GitLab)
 */
export const GitPO = {
    viewSourceLinkText: 'View Source',
    githubLinkSelector: 'a[href*="github.com"]',
    gitlabLinkSelector: 'a[href*="gitlab.com"]',
    bitbucketLinkSelector: 'a[href*="bitbucket.org"]',
}

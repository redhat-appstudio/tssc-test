/**
 * Common Page Objects
 * 
 * Contains locators and constants for UI elements that are shared
 * across multiple pages in the Developer Hub.
 */

export const CommonPO = {
    welcomeTitle: 'Welcome back!',
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
}
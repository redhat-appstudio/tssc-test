/**
 * Registry Page Objects
 * 
 * Contains locators and constants for UI elements that are shared
 * across registry-related pages and components.
 */

export const RegistryPO = {
    // Column headers
    tagColumnHeader: 'Tag',
    lastModifiedColumnHeader: 'Last Modified',
    securityScanColumnHeader: 'Security Scan',
    sizeColumnHeader: 'Size',
    expiresColumnHeader: 'Expires',
    manifestColumnHeader: 'Manifest',

    // Nexus repository headers
    versionColumnHeader: 'Version',
    artifactColumnHeader: 'Artifact',
    repositoryTypeColumnHeader: 'Repository Type',
    checksumColumnHeader: 'Checksum',
    modifiedColumnHeader: 'Modified',

    // Vulnerabilities table headers
    advisoryColumnHeader: 'Advisory',
    severityColumnHeader: 'Severity',
    packageNameColumnHeader: 'Package Name',
    currentVersionColumnHeader: 'Current Version',
    fixedByColumnHeader: 'Fixed By',

    // Search elements
    searchPlaceholder: 'Search',
    clearSearchButtonLabel: 'Clear Search',

    // Repository elements
    quayRepositoryPrefix: 'Quay repository:',
    nexusRepositoryPrefix: 'Nexus Repository Manager:',
    backToRepositoryLinkLabel: 'Back to repository'
}; 

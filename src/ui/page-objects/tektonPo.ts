export const TektonPO = {
	// Test IDs
	logsIconTestId: 'view-logs-icon',
	internalSbomLinkTestId: 'internal-sbom-link',
	viewOutputTestId: 'view-output-icon',
	closeIconTestId: 'CloseIcon',

	// Titles and headings
	logsDialogTitle: 'PipelineRun logs',
	actionsColumnHeader: 'ACTIONS',
    searchBoxName: 'Search',
    sbomStepName: 'STEP-SHOW-SBOM',
    expandButtonName: 'expand row',
    zoomInButtonName: 'Zoom In',
    zoomOutButtonName: 'Zoom Out',
    resetViewButtonName: 'Reset View',
    fitToScreenButtonName: 'Fit to Screen',

	// Data attributes
	graphSelector: 'g[data-kind="graph"][data-type="graph"]',

	// Regex and text matchers
	onPushRowRegex: /on-push/i,
	logStepRegex: /\bSTEP\b/i,
	vulnerabilitySeverityRegex: /Critical|High|Medium|Low/i,
	durationRegex: /\d+\s+minutes?\s+\d+\s+seconds?/,

	// Status constants
	statusOkTestId: 'status-ok',
	statusSucceededText: 'Succeeded',

	// Task names
    sourceTasks: ['init', 'clone-repository', 'build-container', 'update-deployment', 'acs-image-scan', 'acs-image-check', 'acs-deploy-check', 'show-summary', 'show-sbom'],
	gitopsTasks: ['clone-repository', 'get-images-to-verify', 'get-images-to-upload-sbom', 'download-sboms', 'upload-sboms-to-trustification', 'verify-enterprise-contract'],
};

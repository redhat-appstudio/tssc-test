export const TektonPO = {
	// Test IDs
	logsIconTestId: 'view-logs-icon',
	sbomIconTestId: 'view-sbom-icon',
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
	durationRegex: /\d+\s+minutes?\s+\d+\s+seconds?|\d+\s+minutes?|\d+\s+seconds?/,

	// Task names
    sourceTasks: ['clone-repository', 'build', 'deploy', 'scan', 'deployment-check', 'show-sbom', 'summarize'],
	gitopsTasks: ['clone-repository', 'get-images', 'download-sboms', 'verify-conforma', 'upload-sboms'],
};

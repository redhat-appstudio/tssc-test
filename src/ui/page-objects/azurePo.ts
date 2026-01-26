export const AzurePO = {
    pipelinesHeading: 'Azure Pipelines',
    buildsHeadingRegex: /Azure Pipelines - Builds/,
    logsPopupHeadingRegex: /^Build Logs/,

    viewLogsButtonName: 'View Logs',
    closeButtonName: 'close',

    // Column header titles
    columnHeaders: ['ID', 'Build', 'Source', 'State', 'Duration', 'Age', 'Logs'],

    // Cell indices
    cellIndex: {
        id: 0,
        build: 1,
        source: 2,
        state: 3,
        duration: 4,
        age: 5,
        logs: 6,
    },

    // Cell content patterns
    pprNumberRegex: /^\d+$/,
    branchCommitRegex: /refs\/heads\/\w+\s+\([a-f0-9]+\)/,
    durationRegex: /\d+[hms]/,
    relativeTimeRegex: /.+ago$/,
};

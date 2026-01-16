export enum AzurePipelineRunStatus {
  CANCELLING = 'cancelling',
  COMPLETED = 'completed',
  IN_PROGRESS = 'inProgress',
  NOT_STARTED = 'notStarted',
  POSTPONED = 'postponed',
  UNKNOWN = 'unknown',
}

export enum AzurePipelineRunResult {
  CANCELED = 'canceled',
  FAILED = 'failed',
  SUCCEEDED = 'succeeded',
  SKIPPED = 'skipped',
  PARTIALLY_SUCCEEDED = 'partiallySucceeded',
  UNKNOWN = 'unknown',
}

export enum AzurePipelineTriggerReason {
  MANUAL = 'manual',
  INDIVIDUAL_CI = 'individualCI',
  BATCH_CI = 'batchedCI',
  SCHEDULE = 'schedule',
  PULL_REQUEST = 'pullRequest',
  USER_CREATED = 'userCreated',
  VALIDATE_SHELVESET = 'validateShelveset',
  CHECK_IN_SHELVESET = 'checkInShelveset',
  RESOURCE_TRIGGER = 'resourceTrigger',
  BUILD_COMPLETION = 'buildCompletion',
  UNKNOWN = 'unknown',
}

export interface AzurePipelineRun {
  id: number;
  name: string;
  pipeline: {
    id: number;
    name: string;
    folder?: string;
    url?: string;
  };
  state: AzurePipelineRunStatus;
  result?: AzurePipelineRunResult | null;
  createdDate: string;
  finishedDate?: string | null;
  url: string;
  log?: {
    type: string;
    url: string;
  };
  variables?: { [key: string]: { value: string } | undefined };
}

export interface AzurePipelineRunLogOptions {
  id: number;
  url: string;
  signedContent?: {
    url: string;
    signatureExpires: string;
  }
  createdOn: string;
  lastChangedOn: string;
  lineCount: number;
}

export interface AzureBuild {
  id: number;
  buildNumber: string;
  status: 'succeeded' | 'failed' | 'inProgress' | 'stopped' | 'notStarted';
  reason: 'manual' | 'individualCI' | 'pullRequest' | string;
  startTime: string;
  finishTime: string;
  url: string;
  log?: {
    type: string;
    url: string;
  };
  sourceGetVersion?: string;
  triggerInfo?: {
    'ci.sourceSha'?: string;
    'pr.sourceSha'?: string;
    'pr.pullRequestId'?: string;
  };
}

export interface AzurePipelineDefinition {
  id: number;
  name: string;
  folder: string;
  path: string;
  url: string;
  _links: {
    web: { href: string };
    self: { href: string };
  };
  repository?: {
    id: string;
    type: string;
    name: string;
    defaultBranch?: string;
  };
  process: { type: 1; yamlFilename: string } | { type: 2 };
  revision: number;
}

export interface AzurePipelinesClientConfig {
  host: string;
  organization: string;
  project: string;
  pat: string;
  apiVersion?: string;
}

export interface AgentPool {
  id: number;
  name: string;
  poolType: 'automation' | 'deployment';
  isHosted: boolean;
}

export interface AgentQueue {
  id: number;
  name: string;
  pool: {
    id: number;
    name: string;
    isHosted: boolean;
  };
}

export interface VariableGroup {
  id: number;
  name: string;
}

export interface ServiceEndpoint {
  id: string;
  name: string;
  type: string;
  url: string;
  owner: string;
}
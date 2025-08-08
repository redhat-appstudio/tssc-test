import { V1ObjectMeta } from '@kubernetes/client-node';

/**
 * Application resource health status
 */
export interface ApplicationHealthStatus {
  status: string;
  message?: string;
}

/**
 * Application sync status
 */
export interface ApplicationSyncStatus {
  status: string;
  revision: string;
  revisions?: string[];
  comparedTo?: {
    source: ApplicationSource;
    destination: ApplicationDestination;
  };
}

/**
 * Application operation state
 */
export interface ApplicationOperationState {
  phase: string;
  message?: string;
  syncResult?: SyncOperationResult;
  startedAt: string;
  finishedAt?: string;
  operation?: Operation;
  retryCount?: number;
}

/**
 * Sync operation result
 */
export interface SyncOperationResult {
  resources: ResourceResult[];
  revision: string;
  source: ApplicationSource;
}

/**
 * Resource result from a sync operation
 */
export interface ResourceResult {
  group: string;
  version: string;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  message: string;
  hookPhase?: string;
  syncPhase?: string;
}

/**
 * Operation definition
 */
export interface Operation {
  sync?: SyncOperation;
  retry?: RetryStrategy;
  info?: { name: string; value: string }[];
}

/**
 * Sync operation definition
 */
export interface SyncOperation {
  revision: string;
  prune: boolean;
  dryRun: boolean;
  resources?: SyncOperationResource[];
  source?: ApplicationSource;
  syncOptions?: string[];
}

/**
 * Resource to sync
 */
export interface SyncOperationResource {
  group: string;
  kind: string;
  name: string;
  namespace?: string;
}

/**
 * Retry strategy for operations
 */
export interface RetryStrategy {
  limit?: number;
  backoff?: {
    duration?: string;
    factor?: number;
    maxDuration?: string;
  };
}

/**
 * Application resource
 */
export interface ApplicationResource {
  group: string;
  version: string;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  health?: ApplicationHealthStatus;
  hook?: boolean;
  requiresPruning?: boolean;
}

/**
 * Source of an application
 */
export interface ApplicationSource {
  repoURL: string;
  path?: string;
  targetRevision?: string;
  chart?: string;
  helm?: {
    parameters?: { name: string; value: string }[];
    values?: string;
    fileParameters?: { name: string; path: string }[];
    valueFiles?: string[];
  };
  kustomize?: {
    namePrefix?: string;
    nameSuffix?: string;
    images?: string[];
    commonLabels?: { [key: string]: string };
    version?: string;
  };
  directory?: {
    recurse: boolean;
    jsonnet?: {
      extVars?: { name: string; value: string }[];
      tlas?: { name: string; value: string }[];
    };
  };
  plugin?: {
    name: string;
    env?: { name: string; value: string }[];
  };
}

/**
 * Destination of an application deployment
 */
export interface ApplicationDestination {
  server: string;
  namespace: string;
  name?: string;
}

/**
 * Application status
 */
export interface ApplicationStatus {
  observedAt?: string;
  resources: ApplicationResource[];
  health: ApplicationHealthStatus;
  sync: ApplicationSyncStatus;
  history?: RevisionHistory[];
  conditions?: ApplicationCondition[];
  reconciledAt?: string;
  operationState?: ApplicationOperationState;
  sourceType?: string;
  summary?: {
    images?: string[];
    externalURLs?: string[];
  };
}

/**
 * Revision history entry
 */
export interface RevisionHistory {
  revision: string;
  deployedAt: string;
  id: number;
  source: ApplicationSource;
}

/**
 * Application condition
 */
export interface ApplicationCondition {
  type: string;
  message: string;
  lastTransitionTime?: string;
  status: string;
}

/**
 * Application specification
 */
export interface ApplicationSpec {
  source: ApplicationSource;
  destination: ApplicationDestination;
  project: string;
  syncPolicy?: {
    automated?: {
      prune: boolean;
      selfHeal: boolean;
      allowEmpty?: boolean;
    };
    syncOptions?: string[];
    retry?: RetryStrategy;
  };
  ignoreDifferences?: {
    group: string;
    kind: string;
    name?: string;
    namespace?: string;
    jsonPointers?: string[];
    jqPathExpressions?: string[];
  }[];
  info?: { name: string; value: string }[];
  revisionHistoryLimit?: number;
  operation?: Operation;
}

/**
 * Full ArgoCD Application resource
 */
export interface ApplicationKind {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta;
  spec: ApplicationSpec;
  status?: ApplicationStatus;
}

/**
 * Sync operation options
 */
export interface SyncOptions {
  dryRun?: boolean;
  prune?: boolean;
  force?: boolean;
  replace?: boolean;
  serverSideApply?: boolean;
  skipSchemaValidation?: boolean;
}

/**
 * Application sync result
 */
export interface ApplicationSyncResult {
  success: boolean;
  message: string;
  health: string;
  sync: string;
  operationPhase: string;
}

/**
 * Interface for ArgoCD server connection information
 */
export interface ArgoCDConnectionInfo {
  serverUrl: string;
  username: string;
  password: string;
}

/**
 * ArgoCD connection configuration
 */
export interface ArgoCDConnectionConfig {
  namespace: string;
  instanceName?: string;
  timeout?: number;
  retries?: number;
}

/**
 * ArgoCD CLI configuration
 */
export interface ArgoCDCliConfig {
  serverUrl: string;
  username: string;
  password: string;
  insecure?: boolean;
  skipTestTls?: boolean;
  grpcWeb?: boolean;
}

/**
 * ArgoCD instance specification
 */
export interface ArgoCDInstanceSpec {
  server?: {
    route?: {
      enabled?: boolean;
      host?: string;
    };
    service?: {
      type?: string;
    };
  };
  controller?: {
    resources?: {
      requests?: Record<string, string>;
      limits?: Record<string, string>;
    };
  };
  dex?: {
    openShiftOAuth?: boolean;
  };
  rbac?: {
    defaultPolicy?: string;
    policy?: string;
  };
}

/**
 * ArgoCD instance status
 */
export interface ArgoCDInstanceStatus {
  phase?: string;
  server?: string;
  applicationController?: string;
  dex?: string;
  redis?: string;
  repo?: string;
}

/**
 * Full ArgoCD instance resource
 */
export interface ArgoCDInstanceKind {
  apiVersion: string;
  kind: string;
  metadata: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
    uid?: string;
  };
  spec?: ArgoCDInstanceSpec;
  status?: ArgoCDInstanceStatus;
} 
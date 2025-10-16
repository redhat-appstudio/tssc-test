import { KubeClient } from '../ocp/kubeClient';
import { ArgoCDConnectionService } from './services/connection.service';
import { ArgoCDApplicationService } from './services/application.service';
import { ArgoCDSyncService } from './services/sync.service';

/**
 * Main ArgoCD client implementation following the Facade pattern
 * Provides a simplified interface to the underlying ArgoCD services
 */
export class ArgoCDClient {
  public readonly connection: ArgoCDConnectionService;
  public readonly applications: ArgoCDApplicationService;
  public readonly sync: ArgoCDSyncService;

  constructor(private readonly _kubeClient: KubeClient) {
    this.connection = new ArgoCDConnectionService(_kubeClient);
    this.applications = new ArgoCDApplicationService(_kubeClient);
    this.sync = new ArgoCDSyncService(this.connection, this.applications, _kubeClient);
  }
}

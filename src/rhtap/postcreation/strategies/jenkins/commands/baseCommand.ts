import { KubeClient } from '../../../../../api/ocp/kubeClient';
import { Component } from '../../../../core/component';
import { ACS } from '../../../../core/integration/acs';
import { JenkinsCI } from '../../../../core/integration/ci';
import { Git } from '../../../../core/integration/git';
import { TAS } from '../../../../core/integration/tas';
import { TPA } from '../../../../core/integration/tpa';
import { CredentialService } from '../../../services/credentialService';

/**
 * Base class for all Jenkins commands
 * Provides common functionality and properties needed by all commands
 */
export abstract class BaseCommand {
  protected component: Component;
  protected jenkinsCI: JenkinsCI;
  protected git: Git;
  protected folderName: string;
  protected kubeClient: KubeClient;
  protected tas!: TAS;
  protected acs!: ACS;
  protected tpa!: TPA;
  protected credentialService: CredentialService;

  constructor(component: Component) {
    this.component = component;
    this.jenkinsCI = component.getCI() as JenkinsCI;
    this.git = component.getGit();
    this.folderName = component.getName();
    this.kubeClient = component.getKubeClient();

    // Will be initialized as needed in commands
    this.credentialService = CredentialService.getInstance(this.kubeClient);
  }

  /**
   * Ensures all required services are initialized
   */
  protected async ensureServicesInitialized(): Promise<void> {
    this.tas = await TAS.initialize(this.kubeClient);
    this.acs = await ACS.initialize(this.kubeClient);
    this.tpa = await TPA.initialize(this.kubeClient);
  }

  /**
   * Execute the command's functionality
   */
  public abstract execute(): Promise<void>;

  /**
   * Log the start of a command operation
   * @param action Description of the action being performed
   */
  protected logStart(action: string): void {
    console.log(`Starting ${action} for component ${this.folderName}...`);
  }

  /**
   * Log the completion of a command operation
   * @param action Description of the action that was performed
   */
  protected logComplete(action: string): void {
    console.log(`Completed ${action} for component ${this.folderName}`);
  }
}

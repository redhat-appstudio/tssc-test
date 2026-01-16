import { KubeClient } from '../../../../api/ocp/kubeClient';
import { Component } from '../../../core/component';
import { ACS } from '../../../core/integration/acs';
import { CI } from '../../../core/integration/ci';
import { Git } from '../../../core/integration/git';
import { ImageRegistry } from '../../../core/integration/registry';
import { TAS } from '../../../core/integration/tas';
import { TPA } from '../../../core/integration/tpa';
import { CredentialService } from '../../services/credentialService';
import { isSelfSignedCluster } from '../../../../utils/certificateHelper';
import { Command } from './command';
import { LoggerFactory } from '../../../../logger/factory/loggerFactory';
import { Logger } from '../../../../logger/logger';

/**
 * Base class for all Jenkins commands
 * Provides common functionality and properties needed by all commands
 */
export abstract class BaseCommand implements Command {
  protected readonly logger: Logger;
  protected component: Component;
  protected ci: CI;
  protected git: Git;
  protected folderName: string;
  protected kubeClient: KubeClient;
  protected tas!: TAS;
  protected acs!: ACS;
  protected tpa!: TPA;
  protected credentialService: CredentialService;
  protected imageRegistry: ImageRegistry;

  constructor(component: Component) {
    this.logger = LoggerFactory.getLogger('postcreation.command.base');
    this.component = component;
    this.ci = component.getCI();
    this.git = component.getGit();
    this.folderName = component.getName();
    this.kubeClient = component.getKubeClient();
    this.imageRegistry = component.getRegistry();

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
    this.logger.info('Starting {} for component {}...', action, this.folderName);
  }

  /**
   * Log the completion of a command operation
   * @param action Description of the action that was performed
   */
  protected logComplete(action: string): void {
    this.logger.info('Completed {} for component {}', action, this.folderName);
  }

  /**
   * Get the cluster's root CA certificate if self-signed certificates are detected
   * @returns A Promise that resolves to the root CA certificate as a string, or null if not needed
   */
  protected async getCustomRootCA(): Promise<string | null> {
    // Perform detection - obtain all info from cluster
    try {
      const rhdhUrl = await this.kubeClient.getOpenshiftRoute('backstage-developer-hub', 'tssc-dh');
      const fullUrl = `https://${rhdhUrl}`;
      const hasSelfSigned = await isSelfSignedCluster(fullUrl);
      
      if (hasSelfSigned) {
        this.logger.info('Detected self-signed certificates - retrieving cluster root CA');
        return await this.kubeClient.getClusterRootCA();
      }
    } catch (error) {
      this.logger.warn('Failed to detect certificate trust, skipping CUSTOM_ROOT_CA: {}', error);
    }
    
    return null;
  }
}

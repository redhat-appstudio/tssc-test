import { Component } from '../../../core/component';
import { AzureCI } from '../../../core/integration/ci/providers/azureCI';
import { BaseCommand } from '../../../postcreation/strategies/commands/baseCommand';

/**
 * Command to remove variables and secrets from Azure
 */
export class RemoveVarsAndSecrets extends BaseCommand {
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart('secrets removal');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([this.removeVarsAndSecrets()]);

    this.logComplete('secrets removal');
  }

  private async removeVarsAndSecrets(): Promise<void> {
    await this.azureCI.deleteVariableGroup(this.component.getName());
  }
}

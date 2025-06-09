import { Component } from '../../../core/component';
import { AzureCI } from '../../../core/integration/ci/providers/azureCI';
import { GitType } from '../../../core/integration/git';
import { BitbucketProvider, GithubProvider, GitlabProvider } from '../../../core/integration/git';
import { Credential } from '../Credentials';
import { BaseCommand } from './baseCommand';

/**
 * Command to add secrets to Azure
 */
export class AddAzureSecrets extends BaseCommand {
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart('secrets addition');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([this.addSecrets()]);

    this.logComplete('secrets addition');
  }

  private async addSecrets(): Promise<void> {
    const [encodedCosignPrivateKey, encodedCosignPrivateKeyPassword] = await Promise.all([
      this.credentialService.getEncodedCosignPrivateKey(),
      this.credentialService.getEncodedCosignPrivateKeyPassword(),
    ]);

    const variables: { key: string; value: string }[] = [
      { key: Credential.ROX_API_TOKEN, value: this.acs.getToken() },
      { key: Credential.COSIGN_SECRET_KEY, value: encodedCosignPrivateKey },
      { key: Credential.COSIGN_SECRET_PASSWORD, value: encodedCosignPrivateKeyPassword },
      { key: Credential.GITOPS_AUTH_PASSWORD, value: this.getGitOpsAuthPassword() },
      {
        key: Credential.IMAGE_REGISTRY_PASSWORD,
        value: this.component.getRegistry().getImageRegistryPassword(),
      },
      { key: Credential.TRUSTIFICATION_BOMBASTIC_API_URL, value: this.tpa.getBombastic_api_url() },
      { key: Credential.TRUSTIFICATION_OIDC_ISSUER_URL, value: this.tpa.getOidc_issuer_url() },
      { key: Credential.TRUSTIFICATION_OIDC_CLIENT_ID, value: this.tpa.getOidc_client_id() },
      {
        key: Credential.TRUSTIFICATION_OIDC_CLIENT_SECRET,
        value: this.tpa.getOidc_client_secret(),
      },
      {
        key: Credential.TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION,
        value: this.tpa.getSupported_cyclonedx_version(),
      },
    ];

    await this.azureCI.createVariableGroup(this.component.getName(), variables);
  }

  private getGitOpsAuthPassword(): string {
    switch (this.git.getGitType()) {
      case GitType.GITHUB:
        const githubProvider = this.git as unknown as GithubProvider;
        return githubProvider.getToken();
      case GitType.GITLAB:
        const gitlabProvider = this.git as unknown as GitlabProvider;
        return gitlabProvider.getToken();
      case GitType.BITBUCKET:
        const bitbucketProvider = this.git as unknown as BitbucketProvider;
        return bitbucketProvider.getAppPassword();
      default:
        throw new Error('Unsupported Git type');
    }
  }
}

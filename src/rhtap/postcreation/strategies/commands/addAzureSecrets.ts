import { Component } from '../../../core/component';
import { AzureCI, Variable as AzureVariable } from '../../../core/integration/ci/providers/azureCI';
import { GitType } from '../../../core/integration/git';
import { BitbucketProvider, GithubProvider, GitlabProvider } from '../../../core/integration/git';
import { Credential } from '../Credentials';
import { BaseCommand } from './baseCommand';

/**
 * Command to add variables and secrets to Azure
 */
export class AddAzureVarsAndSecrets extends BaseCommand {
  private readonly azureCI: AzureCI;

  constructor(component: Component) {
    super(component);
    this.azureCI = this.ci as AzureCI;
  }

  public async execute(): Promise<void> {
    this.logStart('secrets addition');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([this.addVarsAndSecrets()]);

    this.logComplete('secrets addition');
  }

  private async addVarsAndSecrets(): Promise<void> {
    const [encodedCosignPublicKey, encodedCosignPrivateKey, encodedCosignPrivateKeyPassword] =
      await Promise.all([
        this.credentialService.getCosignPublicKey(),
        this.credentialService.getEncodedCosignPrivateKey(),
        this.credentialService.getEncodedCosignPrivateKeyPassword(),
      ]);

    const variables: AzureVariable[] = [
      { key: `ROX_CENTRAL_ENDPOINT`, value: this.acs.getRoxCentralEndpoint(), isSecret: false },
      { key: Credential.ROX_API_TOKEN, value: this.acs.getToken(), isSecret: true },
      { key: `COSIGN_PUBLIC_KEY`, value: encodedCosignPublicKey, isSecret: false },
      { key: Credential.COSIGN_SECRET_KEY, value: encodedCosignPrivateKey, isSecret: true },
      {
        key: Credential.COSIGN_SECRET_PASSWORD,
        value: encodedCosignPrivateKeyPassword,
        isSecret: true,
      },
      { key: Credential.GITOPS_AUTH_PASSWORD, value: this.getGitOpsAuthPassword(), isSecret: true },
      {
        key: `IMAGE_REGISTRY_USER`,
        value: this.component.getRegistry().getImageRegistryUser(),
        isSecret: false,
      },
      {
        key: Credential.IMAGE_REGISTRY_PASSWORD,
        value: this.component.getRegistry().getImageRegistryPassword(),
        isSecret: true,
      },
      {
        key: Credential.TRUSTIFICATION_BOMBASTIC_API_URL,
        value: this.tpa.getBombastic_api_url(),
        isSecret: false,
      },
      {
        key: Credential.TRUSTIFICATION_OIDC_ISSUER_URL,
        value: this.tpa.getOidc_issuer_url(),
        isSecret: false,
      },
      {
        key: Credential.TRUSTIFICATION_OIDC_CLIENT_ID,
        value: this.tpa.getOidc_client_id(),
        isSecret: false,
      },
      {
        key: Credential.TRUSTIFICATION_OIDC_CLIENT_SECRET,
        value: this.tpa.getOidc_client_secret(),
        isSecret: true,
      },
      {
        key: Credential.TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION,
        value: this.tpa.getSupported_cyclonedx_version(),
        isSecret: false,
      },
      {
        key: `REKOR_HOST`,
        value: this.tas.getRekorServerURL(),
        isSecret: false,
      },
      {
        key: `TUF_MIRROR`,
        value: this.tas.getTufMirrorURL(),
        isSecret: false,
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

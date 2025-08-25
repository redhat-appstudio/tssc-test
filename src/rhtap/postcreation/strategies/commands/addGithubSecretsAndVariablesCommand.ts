//for now this is only used for github actions
import { Component } from '../../../core/component';
import { GithubProvider } from '../../../core/integration/git';
import { ImageRegistry } from '../../../core/integration/registry';
import { BaseCommand } from './baseCommand';

// This command is responsible for adding secrets and variables to the github repository
// Github repository
export class AddGithubSecretsAndVariablesCommand extends BaseCommand {
  constructor(component: Component) {
    super(component);
  }

  public async execute(): Promise<void> {
    this.logStart('Secrets and variables addition on git repository');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await this.addSecretsAndVariablesOnSourceRepo(this.imageRegistry, this.git as GithubProvider);
    await this.addSecretsAndVariablesOnGitopsRepo(this.imageRegistry, this.git as GithubProvider);

    this.logComplete('Secrets and variables addition');
  }

  private async addSecretsAndVariablesOnSourceRepo(
    imageRegistry: ImageRegistry,
    github: GithubProvider
  ): Promise<void> {
    const variables = {
      IMAGE_REGISTRY: imageRegistry.getRegistryHost(),
      ROX_CENTRAL_ENDPOINT: this.acs.getRoxCentralEndpoint(),
      IMAGE_REGISTRY_USER: imageRegistry.getImageRegistryUser(),
      REKOR_HOST: this.tas.getRekorServerURL(),
      TUF_MIRROR: this.tas.getTufMirrorURL(),
      COSIGN_PUBLIC_KEY: await this.credentialService.getCosignPublicKey(),
    };

    await github.setVariablesOnSourceRepo(variables);

    const secrets = {
      ROX_API_TOKEN: this.acs.getToken(),
      GITOPS_AUTH_PASSWORD: `${github.getToken()}`,
      IMAGE_REGISTRY_PASSWORD: imageRegistry.getImageRegistryPassword(),
      COSIGN_SECRET_PASSWORD: await this.credentialService.getEncodedCosignPrivateKeyPassword(),
      COSIGN_SECRET_KEY: await this.credentialService.getEncodedCosignPrivateKey(),
    };

    await github.setSecretsOnSourceRepo(secrets);
  }

  private async addSecretsAndVariablesOnGitopsRepo(
    imageRegistry: ImageRegistry,
    github: GithubProvider
  ): Promise<void> {
    const variables = {
      IMAGE_REGISTRY: imageRegistry.getRegistryHost(),
      COSIGN_PUBLIC_KEY: await this.credentialService.getCosignPublicKey(),
      TRUSTIFICATION_BOMBASTIC_API_URL: this.tpa.getBombastic_api_url(),
      TRUSTIFICATION_OIDC_ISSUER_URL: this.tpa.getOidc_issuer_url(),
      TRUSTIFICATION_OIDC_CLIENT_ID: this.tpa.getOidc_client_id(),
      TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION: this.tpa.getSupported_cyclonedx_version(),
      IMAGE_REGISTRY_USER: imageRegistry.getImageRegistryUser(),
      REKOR_HOST: this.tas.getRekorServerURL(),
      TUF_MIRROR: this.tas.getTufMirrorURL(),
    };

    await github.setVariablesOnGitOpsRepo(variables);

    const secrets = {
      TRUSTIFICATION_OIDC_CLIENT_SECRET: this.tpa.getOidc_client_secret(),
      IMAGE_REGISTRY_PASSWORD: imageRegistry.getImageRegistryPassword(),
    };

    await github.setSecretsOnGitOpsRepo(secrets);
  }
}

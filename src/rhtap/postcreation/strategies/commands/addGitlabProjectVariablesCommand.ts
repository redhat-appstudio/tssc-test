import { Component } from '../../../core/component';
import { GitlabProvider } from '../../../core/integration/git';
import { BaseCommand } from './baseCommand';

export class AddGitlabProjectVariablesCommand extends BaseCommand {
  constructor(component: Component) {
    super(component);
  }

  public async execute(): Promise<void> {
    this.logStart('Environment variables addition');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([
      this.addACSVariables(),
      this.addGitAuthVariables(),
      this.addRokorServerURLVariables(),
      this.addTufMirrorURLVariables(),
      this.addCosignSecretVariables(),
      this.addImageRegistryAuthVariables(),
    ]);

    this.logComplete('Environment variables addition');
  }

  private async addACSVariables(): Promise<void> {
    const gitlab = this.git as unknown as GitlabProvider;

    // Create a map of variables instead of calling the method multiple times
    await gitlab.setProjectVariableOnSourceRepo({
      DISABLE_ACS: 'false',
      ROX_CENTRAL_ENDPOINT: this.acs.getRoxCentralEndpoint(),
      ROX_API_TOKEN: this.acs.getToken(),
    });
  }

  private async addGitAuthVariables(): Promise<void> {
    const gitlab = this.git as unknown as GitlabProvider;
    const password = gitlab.getToken();
    await gitlab.setProjectVariableOnSourceRepo({
      GITOPS_AUTH_PASSWORD: `fakeUsername:${password}`,
    });
  }

  private async addRokorServerURLVariables(): Promise<void> {
    const gitlab = this.git as unknown as GitlabProvider;
    const rekorHost = this.tas.getRokorServerURL();

    await Promise.all([
      gitlab.setProjectVariableOnSourceRepo({
        REKOR_HOST: rekorHost,
      }),
      gitlab.setProjectVariableOnGitOpsRepo({
        REKOR_HOST: rekorHost,
      }),
    ]);
  }

  private async addTufMirrorURLVariables(): Promise<void> {
    const gitlab = this.git as unknown as GitlabProvider;
    const tufMirror = this.tas.getTufMirrorURL();

    await Promise.all([
      gitlab.setProjectVariableOnSourceRepo({
        TUF_MIRROR: tufMirror,
      }),
      gitlab.setProjectVariableOnGitOpsRepo({
        TUF_MIRROR: tufMirror,
      }),
    ]);
  }

  public async addCosignSecretVariables(): Promise<void> {
    const gitlab = this.git as unknown as GitlabProvider;
    const cosignPublicKey = await this.credentialService.getCosignPublicKey();

    // For source repo - all cosign variables
    await gitlab.setProjectVariableOnSourceRepo({
      COSIGN_SECRET_KEY: await this.credentialService.getEncodedCosignPrivateKey(),
      COSIGN_SECRET_PASSWORD: await this.credentialService.getEncodedCosignPrivateKeyPassword(),
      COSIGN_PUBLIC_KEY: cosignPublicKey,
    });

    // For GitOps repo - only public key
    await gitlab.setProjectVariableOnGitOpsRepo({
      COSIGN_PUBLIC_KEY: cosignPublicKey,
    });
  }

  public async addImageRegistryAuthVariables(): Promise<void> {
    const gitlab = this.git as unknown as GitlabProvider;
    const user = this.component.getRegistry().getImageRegistryUser();
    const password = this.component.getRegistry().getImageRegistryPassword();

    // Source repo variables
    await gitlab.setProjectVariableOnSourceRepo({
      IMAGE_REGISTRY_USER: user,
      IMAGE_REGISTRY_PASSWORD: password,
    });

    // GitOps repo variables
    await gitlab.setProjectVariableOnGitOpsRepo({
      IMAGE_REGISTRY_USER: user,
      IMAGE_REGISTRY_PASSWORD: password,
    });
  }
}

import { Component } from '../../../core/component';
import { GitType } from '../../../core/integration/git';
import {
  BitbucketProvider,
  GithubProvider,
  GitlabProvider,
} from '../../../core/integration/git';
import { BaseCommand } from './baseCommand';

// It works on gitlab when using gitlabci as pipeline provider
//TODO: see if it works on other providers
export class AddEnvironmentVariablesCommand extends BaseCommand {
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
    await Promise.all([
      this.git.addVariableOnSourceRepo(
        'DISABLE_ACS',
        'false',
      ),
      this.git.addVariableOnSourceRepo(
        'ROX_CENTRAL_ENDPOINT',
        this.acs.getRoxCentralEndpoint(),
      ),
      this.git.addVariableOnSourceRepo(
        'ROX_API_TOKEN',
        this.acs.getToken(),
      ),
    ]);
  }

  private async addGitAuthVariables(): Promise<void> {
    const password = this.getGitOpsAuthPassword();
    await this.git.addVariableOnSourceRepo(
      'GITOPS_AUTH_PASSWORD',
      `fakeUsername:${password}`,
    );
  }

  //REKOR_HOST
  private async addRokorServerURLVariables(): Promise<void> {
    await this.git.addVariableOnSourceRepo(
      'REKOR_HOST',
      this.tas.getRokorServerURL(),
    );
    await this.git.addVariableOnGitOpsRepo(
      'REKOR_HOST',
      this.tas.getRokorServerURL(),
    );
  }

  //TUF_MIRROR
  private async addTufMirrorURLVariables(): Promise<void> {
    await this.git.addVariableOnSourceRepo(
      'TUF_MIRROR',
      this.tas.getTufMirrorURL(),
    );
    await this.git.addVariableOnGitOpsRepo(
      'TUF_MIRROR',
      this.tas.getTufMirrorURL(),
    );
  }

  public async addCosignSecretVariables(): Promise<void> {
    await Promise.all([
      this.git.addVariableOnSourceRepo(
        'COSIGN_SECRET_KEY',
        await this.credentialService.getEncodedCosignPrivateKey()
      ),
      this.git.addVariableOnSourceRepo(
        'COSIGN_SECRET_PASSWORD',
        await this.credentialService.getEncodedCosignPrivateKeyPassword()
      ),
      this.git.addVariableOnSourceRepo(
        'COSIGN_PUBLIC_KEY',
        await this.credentialService.getCosignPublicKey()
      ),
      this.git.addVariableOnGitOpsRepo(
        'COSIGN_PUBLIC_KEY',
        await this.credentialService.getCosignPublicKey()
      ),
    ]);
  }

  public async addImageRegistryAuthVariables(): Promise<void> {
    await this.git.addVariableOnSourceRepo(
      'IMAGE_REGISTRY_USER',
      this.component.getRegistry().getImageRegistryUser()
    );
    await this.git.addVariableOnSourceRepo(
      'IMAGE_REGISTRY_PASSWORD',
      this.component.getRegistry().getImageRegistryPassword()
    );
    await this.git.addVariableOnGitOpsRepo(
      'IMAGE_REGISTRY_USER',
      this.component.getRegistry().getImageRegistryUser()
    );
    await this.git.addVariableOnGitOpsRepo(
      'IMAGE_REGISTRY_PASSWORD',
      this.component.getRegistry().getImageRegistryPassword()
    );
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

import { CredentialType } from '../../../../api/ci/jenkinsClient';
import { Component } from '../../../core/component';
import { JenkinsCI } from '../../../core/integration/ci';
import { GitType } from '../../../core/integration/git';
import { BitbucketProvider, GithubProvider, GitlabProvider } from '../../../core/integration/git';
import { Credential } from '../Credentials';
import { BaseCommand } from './baseCommand';

/**
 * Command to add secrets to Jenkins
 */
export class AddJenkinsSecretsCommand extends BaseCommand {
  private readonly jenkinsCI: JenkinsCI;

  constructor(component: Component) {
    super(component);
    this.jenkinsCI = this.ci as JenkinsCI;
  }

  public async execute(): Promise<void> {
    this.logStart('secrets addition');

    // Initialize required services before using them
    await this.ensureServicesInitialized();

    await Promise.all([
      this.addAcsSecrets(),
      this.addCosignSecrets(),
      this.addGitAuthSecrets(),
      this.addImageRegistrySecrets(),
      this.addTpaSecrets(),
    ]);

    this.logComplete('secrets addition');
  }

  private async addAcsSecrets(): Promise<void> {
    await this.jenkinsCI.addCredential(
      this.folderName,
      Credential.ROX_API_TOKEN,
      this.acs.getToken()
    );
  }

  private async addCosignSecrets(): Promise<void> {
    await Promise.all([
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.COSIGN_SECRET_KEY,
        await this.credentialService.getEncodedCosignPrivateKey()
      ),
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.COSIGN_SECRET_PASSWORD,
        await this.credentialService.getEncodedCosignPrivateKeyPassword()
      ),
    ]);
  }

  private async addGitAuthSecrets(): Promise<void> {
    const password = this.getGitOpsAuthPassword();
    await this.jenkinsCI.addCredential(
      this.folderName,
      Credential.GITOPS_AUTH_PASSWORD,
      `fakeUsername:${password}`,
      CredentialType.USERNAME_PASSWORD
    );
  }

  private async addImageRegistrySecrets(): Promise<void> {
    await this.jenkinsCI.addCredential(
      this.folderName,
      Credential.IMAGE_REGISTRY_PASSWORD,
      this.component.getRegistry().getImageRegistryPassword()
    );
  }

  private async addTpaSecrets(): Promise<void> {
    await Promise.all([
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.TRUSTIFICATION_BOMBASTIC_API_URL,
        this.tpa.getBombastic_api_url()
      ),
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.TRUSTIFICATION_OIDC_ISSUER_URL,
        this.tpa.getOidc_issuer_url()
      ),
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.TRUSTIFICATION_OIDC_CLIENT_ID,
        this.tpa.getOidc_client_id()
      ),
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.TRUSTIFICATION_OIDC_CLIENT_SECRET,
        this.tpa.getOidc_client_secret()
      ),
      this.jenkinsCI.addCredential(
        this.folderName,
        Credential.TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION,
        this.tpa.getSupported_cyclonedx_version()
      ),
    ]);
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

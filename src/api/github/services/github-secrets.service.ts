import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
import { GithubApiError, GithubNotFoundError } from '../errors/github.errors';

export interface RepoSecretConfig {
  /** Secret name */
  name: string;
  /** Encrypted secret value */
  encryptedValue: string;
  /** Public key ID for encryption */
  keyId: string;
}

// Type aliases for GitHub API responses - exported for external use
export type RepoSecret = Endpoints['GET /repos/{owner}/{repo}/actions/secrets/{secret_name}']['response']['data'];
export type RepoSecretsList = Endpoints['GET /repos/{owner}/{repo}/actions/secrets']['response']['data'];

export class GithubSecretsService {
  constructor(private readonly octokit: Octokit) {}

  public async createOrUpdateRepoSecret(
    owner: string,
    repo: string,
    config: RepoSecretConfig,
  ): Promise<void> {
    try {
      console.log(`Setting secret "${config.name}" for ${owner}/${repo}`);

      await this.octokit.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: config.name,
        encrypted_value: config.encryptedValue,
        key_id: config.keyId,
      });

      console.log(`Secret "${config.name}" set successfully for ${owner}/${repo}`);
    } catch (error: any) {
      console.error(`Failed to set secret "${config.name}" for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to set secret "${config.name}" for ${owner}/${repo}`, error.status, error);
    }
  }

  public async getRepoSecret(
    owner: string,
    repo: string,
    secretName: string,
  ): Promise<RepoSecret> {
    try {
      const { data } = await this.octokit.actions.getRepoSecret({
        owner,
        repo,
        secret_name: secretName,
      });
      return data;
    } catch (error: any) {
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        console.error(`Secret "${secretName}" not found in ${owner}/${repo}`);
        throw new GithubNotFoundError('repository secret', `"${secretName}" in ${owner}/${repo}`, error.status || 404);
      }
      console.error(`Failed to get secret "${secretName}" for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to get secret "${secretName}" for ${owner}/${repo}`, error.status, error);
    }
  }

  public async listRepoSecrets(
    owner: string,
    repo: string,
  ): Promise<RepoSecretsList> {
    try {
      const { data } = await this.octokit.actions.listRepoSecrets({
        owner,
        repo,
      });
      return data;
    } catch (error: any) {
      console.error(`Failed to list secrets for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to list secrets for ${owner}/${repo}`, error.status, error);
    }
  }

  public async deleteRepoSecret(
    owner: string,
    repo: string,
    secretName: string,
  ): Promise<void> {
    try {
      console.log(`Deleting secret "${secretName}" from ${owner}/${repo}`);

      await this.octokit.actions.deleteRepoSecret({
        owner,
        repo,
        secret_name: secretName,
      });

      console.log(`Secret "${secretName}" deleted successfully from ${owner}/${repo}`);
    } catch (error: any) {
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        console.error(`Secret "${secretName}" not found in ${owner}/${repo}`);
        throw new GithubNotFoundError('repository secret', `"${secretName}" in ${owner}/${repo}`, error.status || 404);
      }
      console.error(`Failed to delete secret "${secretName}" from ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to delete secret "${secretName}" from ${owner}/${repo}`, error.status, error);
    }
  }
}
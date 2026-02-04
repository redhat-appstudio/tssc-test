import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';
import { GithubApiError, GithubNotFoundError } from '../errors/github.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

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
  private readonly logger: Logger;

  constructor(private readonly octokit: Octokit) {
    this.logger = LoggerFactory.getLogger('github.secrets');
  }

  public async createOrUpdateRepoSecret(
    owner: string,
    repo: string,
    config: RepoSecretConfig,
  ): Promise<void> {
    try {
      this.logger.info(`Setting secret "${config.name}" for ${owner}/${repo}`);

      await this.octokit.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: config.name,
        encrypted_value: config.encryptedValue,
        key_id: config.keyId,
      });

      this.logger.info(`Secret "${config.name}" set successfully for ${owner}/${repo}`);
    } catch (error: any) {
      this.logger.error(`Failed to set secret "${config.name}" for ${owner}/${repo}: ${error}`);
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
      this.logger.info(`Retrieved secret "${secretName}" from ${owner}/${repo}`);
      return data;
    } catch (error: any) {
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        this.logger.error(`Secret "${secretName}" not found in ${owner}/${repo}`);
        throw new GithubNotFoundError('repository secret', `"${secretName}" in ${owner}/${repo}`, error.status || 404);
      }
      this.logger.error(`Failed to get secret "${secretName}" for ${owner}/${repo}: ${error}`);
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
      this.logger.info(`Listed ${data.total_count} secrets for ${owner}/${repo}`);
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to list secrets for ${owner}/${repo}: ${error}`);
      throw new GithubApiError(`Failed to list secrets for ${owner}/${repo}`, error.status, error);
    }
  }

  public async deleteRepoSecret(
    owner: string,
    repo: string,
    secretName: string,
  ): Promise<void> {
    try {
      this.logger.info(`Deleting secret "${secretName}" from ${owner}/${repo}`);

      await this.octokit.actions.deleteRepoSecret({
        owner,
        repo,
        secret_name: secretName,
      });

      this.logger.info(`Secret "${secretName}" deleted successfully from ${owner}/${repo}`);
    } catch (error: any) {
      if (error.status === 404 || (error.response && error.response.status === 404)) {
        this.logger.error(`Secret "${secretName}" not found in ${owner}/${repo}`);
        throw new GithubNotFoundError('repository secret', `"${secretName}" in ${owner}/${repo}`, error.status || 404);
      }
      this.logger.error(`Failed to delete secret "${secretName}" from ${owner}/${repo}: ${error}`);
      throw new GithubApiError(`Failed to delete secret "${secretName}" from ${owner}/${repo}`, error.status, error);
    }
  }
}
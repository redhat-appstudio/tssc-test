import { Octokit } from '@octokit/rest';
import { GithubApiError } from '../errors/github.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

export class GithubVariablesService {
  private readonly logger: Logger;

  constructor(private readonly octokit: Octokit) {
    this.logger = LoggerFactory.getLogger('github.variables');
  }

  public async getRepoPublicKey(
    repoOwner: string,
    repoName: string,
  ): Promise<{ key: string; key_id: string }> {
    try {
      const response = await this.octokit.actions.getRepoPublicKey({
        owner: repoOwner,
        repo: repoName,
      });

      return {
        key: response.data.key,
        key_id: response.data.key_id,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get public key for repository ${repoOwner}/${repoName}: ${error}`
      );
      throw new GithubApiError(`Failed to get public key for repository ${repoOwner}/${repoName}`, error.status, error);
    }
  }

  public async setRepoVariables(
    owner: string,
    repo: string,
    variables: Record<string, string>,
  ): Promise<{ created: string[]; updated: string[]; failed: string[] }> {
    this.logger.info(`Setting repo variables for ${owner}/${repo}`);
    const created: string[] = [];
    const updated: string[] = [];
    const failed: string[] = [];

    let existingVariables: Record<string, string> = {};
    let page = 1;
    try {
      while (true) {
        const response = await this.octokit.actions.listRepoVariables({
          owner,
          repo,
          per_page: 100,
          page,
        });
        for (const v of response.data.variables) {
          existingVariables[v.name] = v.value;
        }
        if (response.data.total_count <= page * 100) break;
        page++;
      }
    } catch (error: any) {
      this.logger.error(`Error listing variables: ${error}`);
      throw new GithubApiError(`Failed to list variables for ${owner}/${repo}`, error.status, error);
    }

    for (const [name, value] of Object.entries(variables)) {
      try {
        if (name in existingVariables) {
          if (existingVariables[name] === value) {
            this.logger.info(`Variable "${name}" already set to desired value, skipping`);
            continue;
          }
          await this.octokit.actions.updateRepoVariable({
            owner,
            repo,
            name,
            value,
          });
          updated.push(name);
          this.logger.info(`Updated variable: ${name}`);
        } else {
          await this.octokit.actions.createRepoVariable({
            owner,
            repo,
            name,
            value,
          });
          created.push(name);
          this.logger.info(`Created variable: ${name}`);
        }
      } catch (error: any) {
        failed.push(name);
        this.logger.error(`Error setting variable "${name}": ${error}`);
      }
    }
    return { created, updated, failed };
  }

  public async setRepoVariable(
    owner: string,
    repo: string,
    name: string,
    value: string,
  ): Promise<'created' | 'updated'> {
    this.logger.info(`Setting repo variable "${name}" for ${owner}/${repo}`);

    try {
      const existingVariables: Record<string, string> = {};
      const response = await this.octokit.actions.listRepoVariables({
        owner,
        repo,
        per_page: 100,
      });

      for (const v of response.data.variables) {
        existingVariables[v.name] = v.value;
      }

      if (name in existingVariables) {
        if (existingVariables[name] === value) {
          this.logger.info(`Variable "${name}" already set to desired value, skipping`);
          return 'updated';
        }

        await this.octokit.actions.updateRepoVariable({
          owner,
          repo,
          name,
          value,
        });
        this.logger.info(`Updated variable: ${name}`);
        return 'updated';
      } else {
        await this.octokit.actions.createRepoVariable({
          owner,
          repo,
          name,
          value,
        });
        this.logger.info(`Created variable: ${name}`);
        return 'created';
      }
    } catch (error: any) {
      this.logger.error(`Error setting variable "${name}": ${error}`);
      throw new GithubApiError(`Failed to set variable "${name}" for ${owner}/${repo}`, error.status, error);
    }
  }
}

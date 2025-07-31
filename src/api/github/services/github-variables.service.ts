import { Octokit } from '@octokit/rest';
import { GithubApiError } from '../errors/github.errors';

export class GithubVariablesService {
  constructor(private readonly octokit: Octokit) {}

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
      console.error(
        `Failed to get public key for repository ${repoOwner}/${repoName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new GithubApiError(`Failed to get public key for repository ${repoOwner}/${repoName}`, error.status, error);
    }
  }

  public async setRepoVariables(
    owner: string,
    repo: string,
    variables: Record<string, string>,
  ): Promise<{ created: string[]; updated: string[]; failed: string[] }> {
    console.group(`Setting repo variables for ${owner}/${repo}`);
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
      console.error(`Error listing variables: ${error instanceof Error ? error.message : String(error)}`);
      console.groupEnd();
      throw new GithubApiError(`Failed to list variables for ${owner}/${repo}`, error.status, error);
    }

    for (const [name, value] of Object.entries(variables)) {
      try {
        if (name in existingVariables) {
          if (existingVariables[name] === value) {
            console.log(`Variable "${name}" already set to desired value, skipping.`);
            continue;
          }
          await this.octokit.actions.updateRepoVariable({
            owner,
            repo,
            name,
            value,
          });
          updated.push(name);
          console.log(`Updated variable: ${name}`);
        } else {
          await this.octokit.actions.createRepoVariable({
            owner,
            repo,
            name,
            value,
          });
          created.push(name);
          console.log(`Created variable: ${name}`);
        }
      } catch (error: any) {
        failed.push(name);
        console.error(`Error setting variable "${name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.groupEnd();
    return { created, updated, failed };
  }

  public async setRepoVariable(
    owner: string,
    repo: string,
    name: string,
    value: string,
  ): Promise<'created' | 'updated'> {
    console.log(`Setting repo variable "${name}" for ${owner}/${repo}`);

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
          console.log(`Variable "${name}" already set to desired value, skipping.`);
          return 'updated';
        }

        await this.octokit.actions.updateRepoVariable({
          owner,
          repo,
          name,
          value,
        });
        console.log(`Updated variable: ${name}`);
        return 'updated';
      } else {
        await this.octokit.actions.createRepoVariable({
          owner,
          repo,
          name,
          value,
        });
        console.log(`Created variable: ${name}`);
        return 'created';
      }
    } catch (error: any) {
      console.error(`Error setting variable "${name}": ${error instanceof Error ? error.message : String(error)}`);
      throw new GithubApiError(`Failed to set variable "${name}" for ${owner}/${repo}`, error.status, error);
    }
  }
}

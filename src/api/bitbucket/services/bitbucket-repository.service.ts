import { BitbucketHttpClient } from '../http/bitbucket-http.client';
import { BitbucketRepository, BitbucketBranch, BitbucketCommit } from '../types/bitbucket.types';

export class BitbucketRepositoryService {
  constructor(private readonly httpClient: BitbucketHttpClient) {}

  public async getRepository(workspace: string, repoSlug: string): Promise<BitbucketRepository> {
    return this.httpClient.get(`/repositories/${workspace}/${repoSlug}`);
  }

  public async getBranches(workspace: string, repoSlug: string): Promise<BitbucketBranch[]> {
    const response: any = await this.httpClient.get(`/repositories/${workspace}/${repoSlug}/refs/branches`);
    return response.values;
  }

  public async createBranch(workspace: string, repoSlug: string, name: string, targetHash: string): Promise<BitbucketBranch> {
    return this.httpClient.post(`/repositories/${workspace}/${repoSlug}/refs/branches`, {
      name,
      target: {
        hash: targetHash,
      },
    });
  }

  public async getCommits(workspace: string, repoSlug: string): Promise<BitbucketCommit[]> {
    const response: any = await this.httpClient.get(`/repositories/${workspace}/${repoSlug}/commits`);
    return response.values;
  }

  public async createCommit(workspace: string, repoSlug: string, data: any): Promise<any> {
    return this.httpClient.post(`/repositories/${workspace}/${repoSlug}/src`, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  public async getFileContent(workspace: string, repoSlug: string, filePath: string, ref: string = 'main'): Promise<string> {
    return this.httpClient.get(`/repositories/${workspace}/${repoSlug}/src/${ref}/${filePath}`);
  }
}

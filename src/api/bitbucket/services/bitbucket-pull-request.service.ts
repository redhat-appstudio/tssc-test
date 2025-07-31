import { BitbucketHttpClient } from '../http/bitbucket-http.client';
import { BitbucketPaginatedResponse, BitbucketPullRequest } from '../types/bitbucket.types';

export class BitbucketPullRequestService {
  constructor(private readonly httpClient: BitbucketHttpClient) {}

  public async getPullRequests(workspace: string, repoSlug: string): Promise<BitbucketPullRequest[]> {
    const response = await this.httpClient.get<BitbucketPaginatedResponse<BitbucketPullRequest>>(
      `/repositories/${workspace}/${repoSlug}/pullrequests`,
    );
    return response.values;
  }

  public async createPullRequest(
    workspace: string,
    repoSlug: string,
    data: {
      title: string;
      source: { branch: { name: string } };
      destination: { branch: { name: string } };
      description?: string;
      close_source_branch?: boolean;
    },
  ): Promise<BitbucketPullRequest> {
    return this.httpClient.post<BitbucketPullRequest>(`/repositories/${workspace}/${repoSlug}/pullrequests`, data);
  }

  public async mergePullRequest(
    workspace: string,
    repoSlug: string,
    pullRequestId: number,
    options: {
      message?: string;
      close_source_branch?: boolean;
      merge_strategy?: 'merge_commit' | 'squash' | 'fast_forward';
    } = {},
  ): Promise<BitbucketPullRequest> {
    return this.httpClient.post<BitbucketPullRequest>(`/repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestId}/merge`, options);
  }
}

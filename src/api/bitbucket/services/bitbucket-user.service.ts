import { BitbucketHttpClient } from '../http/bitbucket-http.client';
import { BitbucketUser } from '../types/bitbucket.types';

export class BitbucketUserService {
  constructor(private readonly httpClient: BitbucketHttpClient) {}

  public async getCurrentUser(): Promise<BitbucketUser> {
    return this.httpClient.get('/user');
  }
}

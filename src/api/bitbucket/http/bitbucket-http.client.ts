import { BaseHttpClient } from '../../common/http/base-http.client';
import { BitbucketClientOptions, BitbucketErrorData } from '../types/bitbucket.types';
import { BitbucketError } from '../errors/bitbucket.errors';

export class BitbucketHttpClient extends BaseHttpClient {
  constructor(options: BitbucketClientOptions) {
    const headers: Record<string, string> = {};

    if (options.accessToken) {
      headers['Authorization'] = `Bearer ${options.accessToken}`;
    } else if (options.username && options.appPassword) {
      const credentials = Buffer.from(`${options.username}:${options.appPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    super({
      baseURL: options.baseUrl || 'https://api.bitbucket.org/2.0',
      headers,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (this.isBitbucketError(error)) {
          const { status, data } = error.response;
          const errorData = data as BitbucketErrorData;
          const message = errorData?.error?.message || `Bitbucket API Error: ${status}`;
          return Promise.reject(new BitbucketError(message, status, errorData));
        }
        return Promise.reject(error);
      },
    );
  }

  private isBitbucketError(error: any): error is { response: { status: number; data: any } } {
    return error.isAxiosError && error.response;
  }
}

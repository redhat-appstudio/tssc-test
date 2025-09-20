import axios from 'axios';
import { BaseHttpClient } from '../../common/http/base-http.client';
import { ApiError } from '../../common/errors/api.errors';
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
      timeout: options.timeout, // Pass through timeout (defaults to 30s in BaseHttpClient)
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle ApiError from base interceptor
        if (error instanceof ApiError) {
          const errorData = error.data as BitbucketErrorData;
          const message = errorData?.error?.message || error.message;
          // Preserve error chain using standard Error.cause (type-safe)
          const bitbucketError = new BitbucketError(message, error.status, errorData, error);
          return Promise.reject(bitbucketError);
        }

        // Handle direct AxiosError (if base interceptor didn't catch it)
        if (axios.isAxiosError(error) && error.response) {
          const { status, data } = error.response;
          const errorData = data as BitbucketErrorData;
          const message = errorData?.error?.message || `Bitbucket API Error: ${status}`;
          // Preserve original Axios error (type-safe)
          const bitbucketError = new BitbucketError(message, status, errorData, error);
          return Promise.reject(bitbucketError);
        }

        return Promise.reject(error);
      },
    );
  }
}

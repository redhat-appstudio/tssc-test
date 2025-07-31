import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { BitbucketClientOptions, BitbucketErrorData } from '../types/bitbucket.types';
import { BitbucketError } from '../errors/bitbucket.errors';

export class BitbucketHttpClient {
  private readonly client: AxiosInstance;
  private readonly maxRetries: number = 5;
  private readonly initialRetryDelayMs: number = 1000;

  constructor(options: BitbucketClientOptions) {
    const config: AxiosRequestConfig = {
      baseURL: options.baseUrl || 'https://api.bitbucket.org/2.0',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (options.accessToken) {
      if (!config.headers) config.headers = {};
      config.headers['Authorization'] = `Bearer ${options.accessToken}`;
    } else if (options.username && options.appPassword) {
      if (!config.headers) config.headers = {};
      const credentials = Buffer.from(`${options.username}:${options.appPassword}`).toString('base64');
      config.headers['Authorization'] = `Basic ${credentials}`;
    }

    this.client = axios.create(config);
  }

  private handleApiError(error: any): BitbucketError {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      const errorData = data as BitbucketErrorData;
      const message = errorData?.error?.message || `Bitbucket API Error: ${status}`;
      return new BitbucketError(message, status, errorData);
    }
    return new BitbucketError(error.message || 'An unknown error occurred');
  }

  private async requestWithRetry<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    endpoint: string,
    data?: any,
    config: AxiosRequestConfig = {},
  ): Promise<AxiosResponse<T>> {
    let attempts = 0;
    let delay = this.initialRetryDelayMs;

    while (attempts <= this.maxRetries) {
      try {
        return await this.client.request<T>({
          method,
          url: endpoint,
          data,
          ...config,
        });
      } catch (error: any) {
        const apiError = this.handleApiError(error);
        if (attempts >= this.maxRetries || (apiError.status && apiError.status < 500)) {
          throw apiError;
        }
        console.warn(`Request failed (attempt ${attempts + 1}/${this.maxRetries}). Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        attempts++;
      }
    }
    throw new BitbucketError('Request failed after maximum retries');
  }

  public async get<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const response = await this.requestWithRetry<T>('get', endpoint, undefined, { params });
    return response.data;
  }

  public async post<T>(endpoint: string, data: any, config: AxiosRequestConfig = {}): Promise<T> {
    const response = await this.requestWithRetry<T>('post', endpoint, data, config);
    return response.data;
  }

  public async put<T>(endpoint: string, data: any, config: AxiosRequestConfig = {}): Promise<T> {
    const response = await this.requestWithRetry<T>('put', endpoint, data, config);
    return response.data;
  }

  public async delete<T>(endpoint: string, config: AxiosRequestConfig = {}): Promise<T> {
    const response = await this.requestWithRetry<T>('delete', endpoint, undefined, config);
    return response.data;
  }
}

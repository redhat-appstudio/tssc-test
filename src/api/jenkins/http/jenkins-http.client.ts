import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { JenkinsClientConfig, JenkinsApiResponse } from '../types/jenkins.types';
import { 
  JenkinsError, 
  JenkinsAuthenticationError, 
  JenkinsRateLimitError 
} from '../errors/jenkins.errors';

/**
 * HTTP client for Jenkins API interactions
 */
export class JenkinsHttpClient {
  private client: AxiosInstance;

  constructor(config: JenkinsClientConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      auth: {
        username: config.username,
        password: config.token,
      },
      timeout: 30000, // 30 second timeout
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      config => {
        // Log requests in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`Jenkins API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      error => {
        return Promise.reject(new JenkinsError('Request setup failed', undefined, error));
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          const status = error.response.status;
          const message = error.response.statusText || error.message;

          switch (status) {
            case 401:
            case 403:
              throw new JenkinsAuthenticationError(`Authentication failed: ${message}`);
            case 429:
              const retryAfter = error.response.headers['retry-after'];
              throw new JenkinsRateLimitError(retryAfter ? parseInt(retryAfter) : undefined);
            case 404:
              throw new JenkinsError(`Resource not found: ${message}`, status, error);
            default:
              throw new JenkinsError(
                `Jenkins API request failed: ${message}`,
                status,
                error
              );
          }
        } else if (error.request) {
          throw new JenkinsError('No response received from Jenkins server', undefined, error);
        } else {
          throw new JenkinsError('Request setup failed', undefined, error);
        }
      }
    );
  }

  /**
   * Perform GET request
   */
  async get<T = any>(
    path: string, 
    headers: Record<string, string> = {},
    params?: Record<string, any>
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      headers,
      params,
    };

    const response: AxiosResponse<T> = await this.client.get(path, config);
    return response.data;
  }

  /**
   * Perform POST request
   */
  async post<T = any>(
    path: string,
    data: any,
    headers: Record<string, string> = {},
    params?: Record<string, any>
  ): Promise<JenkinsApiResponse<T>> {
    const config: AxiosRequestConfig = {
      headers,
      params,
    };

    const response: AxiosResponse<T> = await this.client.post(path, data, config);
    
    if (response.status !== 200 && response.status !== 201) {
      throw new JenkinsError(
        `Request failed with status ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    return {
      success: true,
      status: response.status,
      data: response.data,
      location: response.headers.location,
    };
  }

  /**
   * Perform PUT request
   */
  async put<T = any>(
    path: string,
    data: any,
    headers: Record<string, string> = {}
  ): Promise<JenkinsApiResponse<T>> {
    const response: AxiosResponse<T> = await this.client.put(path, data, { headers });
    
    return {
      success: true,
      status: response.status,
      data: response.data,
      location: response.headers.location,
    };
  }

  /**
   * Perform DELETE request
   */
  async delete<T = any>(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<JenkinsApiResponse<T>> {
    const response: AxiosResponse<T> = await this.client.delete(path, { headers });
    
    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  }

  /**
   * Check if Jenkins server is reachable
   */
  async ping(): Promise<boolean> {
    try {
      await this.get('/api/json');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Jenkins version information
   */
  async getVersion(): Promise<string | null> {
    try {
      const response = await this.client.head('/');
      return response.headers['x-jenkins'] || null;
    } catch (error) {
      return null;
    }
  }
} 
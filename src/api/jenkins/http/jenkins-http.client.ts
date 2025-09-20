import { BaseHttpClient } from '../../common/http/base-http.client';
import { ApiError } from '../../common/errors/api.errors';
import { JenkinsClientConfig } from '../types/jenkins.types';
import { JenkinsError, JenkinsAuthenticationError } from '../errors/jenkins.errors';

/**
 * HTTP client for Jenkins API interactions
 */
export class JenkinsHttpClient extends BaseHttpClient {
  constructor(config: JenkinsClientConfig) {
    super({
      baseURL: config.baseUrl,
      timeout: config.timeout, // Pass through timeout (defaults to 30s in BaseHttpClient)
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.token}`).toString('base64')}`,
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // BaseHttpClient already transforms AxiosError → ApiError
        // Map ApiError to Jenkins-specific errors first
        if (error instanceof ApiError) {
          const status = error.status;
          const message = error.message;

          if (status === 401 || status === 403) {
            return Promise.reject(new JenkinsAuthenticationError(`Authentication failed: ${message}`));
          }

          return Promise.reject(new JenkinsError(`Jenkins API request failed: ${message}`, status, error));
        }

        // Fallback: Handle raw AxiosError if BaseHttpClient interceptor didn't catch it
        if (error.response) {
          const { status, statusText } = error.response;
          const message = statusText || error.message;

          if (status === 401 || status === 403) {
            return Promise.reject(new JenkinsAuthenticationError(`Authentication failed: ${message}`));
          }

          return Promise.reject(new JenkinsError(`Jenkins API request failed: ${message}`, status, error));
        } else if (error.request) {
          return Promise.reject(new JenkinsError('No response received from Jenkins server', undefined, error));
        } else {
          return Promise.reject(new JenkinsError('Request setup failed', undefined, error));
        }
      },
    );
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
}
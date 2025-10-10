import { BaseHttpClient } from '../../common/http/base-http.client';
import { JenkinsClientConfig } from '../types/jenkins.types';
import { JenkinsError, JenkinsAuthenticationError } from '../errors/jenkins.errors';

/**
 * HTTP client for Jenkins API interactions
 */
export class JenkinsHttpClient extends BaseHttpClient {
  constructor(config: JenkinsClientConfig) {
    super({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.token}`).toString('base64')}`,
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, statusText } = error.response;
          const message = statusText || error.message;

          if (status === 401 || status === 403) {
            throw new JenkinsAuthenticationError(`Authentication failed: ${message}`);
          }
          
          throw new JenkinsError(`Jenkins API request failed: ${message}`, status, error);
        } else if (error.request) {
          throw new JenkinsError('No response received from Jenkins server', undefined, error);
        } else {
          throw new JenkinsError('Request setup failed', undefined, error);
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
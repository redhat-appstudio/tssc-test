import { BaseHttpClient } from '../../common/http/base-http.client';
import { AxiosError } from 'axios';
import { AzureApiError } from '../errors/azure.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

export interface AzureHttpClientConfig {
  organization: string;
  host: string;
  pat: string;
  timeout?: number;
}

export class AzureHttpClient extends BaseHttpClient {
  private readonly authHeader: string;
  private readonly logger: Logger;

  constructor(config: AzureHttpClientConfig) {
    const base64Pat = Buffer.from(`:${config.pat}`).toString('base64');
    const authHeader = `Basic ${base64Pat}`;

    super({
      baseURL: `https://${config.host}/${config.organization}/`,
      headers: {
        Authorization: authHeader,
      },
      timeout: config.timeout,
    });

    this.logger = LoggerFactory.getLogger('azure.http');
    this.authHeader = authHeader;

    // Interceptors for debugging purposes
    this.client.interceptors.request.use(
      request => {
        this.logger.info(`[Request] > Sending ${request.method?.toUpperCase()} to ${request.baseURL}${request.url}`);
        return request;
      },
      error => {
        this.logger.error(`[Request Error]: ${error}`);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        if (error.response) {
          this.logger.error(`Azure DevOps API Error: ${error.response.status} ${error.response.statusText} - ${error.response.data}`);
        } else if (error.request) {
          this.logger.error(`Azure DevOps API Error: No response received - ${error.request}`);
        } else {
          this.logger.error(`Azure DevOps API Error: Request setup failed - ${error}`);
        }
        // Wrap AxiosError in a custom AzureApiError
        const azureError = new AzureApiError(
          error.message,
          error.response?.status,
          error.response?.data,
          error
        );
        return Promise.reject(azureError);
      }
    );
  }

  public getAuthHeader(): string {
    return this.authHeader;
  }
}
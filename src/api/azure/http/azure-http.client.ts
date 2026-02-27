import { BaseHttpClient } from '../../common/http/base-http.client';
import { ApiError } from '../../common/errors/api.errors';
import { AzureApiError } from '../errors/azure.errors';
import { LoggerFactory, Logger } from '../../../logger/logger';

function sanitizeErrorData(data: unknown): string {
  if (data == null) return 'no data';
  if (typeof data === 'string') return data.slice(0, 2000);
  if (typeof data === 'object') {
    const { message, typeKey, errorCode, statusCode } = data as Record<string, unknown>;
    const parts = [
      message != null ? `message=${message}` : null,
      typeKey != null ? `typeKey=${typeKey}` : null,
      errorCode != null ? `errorCode=${errorCode}` : null,
      statusCode != null ? `statusCode=${statusCode}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '[response data omitted]';
  }
  return String(data);
}

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
      (error) => {
        // Build the AzureApiError first, so wrapping always succeeds regardless of logging
        let azureError: AzureApiError;

        // BaseHttpClient already transforms AxiosError → ApiError
        // Map ApiError to Azure-specific errors first
        if (error instanceof ApiError) {
          azureError = new AzureApiError(error.message, error.status, error.data, error);
          try {
            this.logger.error(`Azure DevOps API Error: ${error.status} - ${sanitizeErrorData(error.data)}`);
          } catch { /* logging must not break error propagation */ }
        } else if (error.response) {
          // Fallback: Handle raw AxiosError if BaseHttpClient interceptor didn't catch it
          azureError = new AzureApiError(error.message, error.response.status, error.response.data, error);
          try {
            this.logger.error(`Azure DevOps API Error: ${error.response.status} ${error.response.statusText} - ${sanitizeErrorData(error.response.data)}`);
          } catch { /* logging must not break error propagation */ }
        } else if (error.request) {
          azureError = new AzureApiError('No response received from Azure DevOps', undefined, undefined, error);
          try {
            const { method, baseURL, url, timeout } = error.request?.config ?? error.config ?? {};
            this.logger.error(`Azure DevOps API Error: No response received - ${method?.toUpperCase()} ${baseURL ?? ''}${url ?? ''} (timeout: ${timeout})`);
          } catch { /* logging must not break error propagation */ }
        } else {
          azureError = new AzureApiError('Request setup failed', undefined, undefined, error);
          try {
            this.logger.error(`Azure DevOps API Error: Request setup failed - ${error}`);
          } catch { /* logging must not break error propagation */ }
        }

        return Promise.reject(azureError);
      }
    );
  }

  public getAuthHeader(): string {
    return this.authHeader;
  }
}
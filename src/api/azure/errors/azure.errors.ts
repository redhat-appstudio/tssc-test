import { ApiError, AuthenticationError, NotFoundError, BadRequestError } from '../../common/errors/api.errors';

export class AzureApiError extends ApiError {
  constructor(message: string, status?: number, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'AzureApiError';
    Object.setPrototypeOf(this, AzureApiError.prototype);
  }
}

export class AzureAuthenticationError extends AuthenticationError {
  constructor(message = 'Azure authentication failed', status = 401, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'AzureAuthenticationError';
    Object.setPrototypeOf(this, AzureAuthenticationError.prototype);
  }
}

export class AzureNotFoundError extends NotFoundError {
  constructor(message = 'Azure resource not found', status = 404, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'AzureNotFoundError';
    Object.setPrototypeOf(this, AzureNotFoundError.prototype);
  }
}

export class AzureBadRequestError extends BadRequestError {
  constructor(message = 'Azure bad request', status = 400, data?: any, cause?: unknown) {
    super(message, status, data, cause);
    this.name = 'AzureBadRequestError';
    Object.setPrototypeOf(this, AzureBadRequestError.prototype);
  }
}
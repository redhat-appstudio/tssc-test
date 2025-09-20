export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly data?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication failed', status = 401, data?: any) {
    super(message, status, data);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', status = 404, data?: any) {
    super(message, status, data);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', status = 400, data?: any) {
    super(message, status, data);
    this.name = 'BadRequestError';
  }
}
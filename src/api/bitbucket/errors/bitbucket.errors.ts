import { ApiError } from '../../common/errors/api.errors';
import { BitbucketErrorData } from '../types/bitbucket.types';

/**
 * Bitbucket-specific error class extending ApiError
 *
 * Provides type-safe error handling for Bitbucket API operations
 * with typed error data specific to Bitbucket's error response format.
 *
 * @extends ApiError
 */
export class BitbucketError extends ApiError {
  constructor(
    message: string,
    status?: number,
    public readonly data?: BitbucketErrorData,
    cause?: unknown
  ) {
    super(message, status, data, cause);
    this.name = 'BitbucketError';

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, BitbucketError.prototype);
  }
}

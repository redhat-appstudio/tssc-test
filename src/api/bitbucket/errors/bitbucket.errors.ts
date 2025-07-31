import { BitbucketErrorData } from '../types/bitbucket.types';

export class BitbucketError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly data?: BitbucketErrorData,
  ) {
    super(message);
    this.name = 'BitbucketError';
  }
}

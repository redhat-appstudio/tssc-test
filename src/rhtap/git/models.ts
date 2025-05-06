export class PullRequest {
  constructor(
    public readonly pullNumber: number,
    public readonly sha: string,
    public readonly repository: string
  ) {}
}

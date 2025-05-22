import { JenkinsCI } from '../../../core/integration/ci';
import { BaseCommand } from './baseCommand';

/**
 * Command to create Jenkins jobs for source and gitops repositories
 */
export class CreateJenkinsJobsCommand extends BaseCommand {
  public async execute(): Promise<void> {
    this.logStart('Jenkins jobs creation');

    const jobs = [
      { name: this.git.getSourceRepoName(), url: this.git.getSourceRepoUrl() },
      { name: this.git.getGitOpsRepoName(), url: this.git.getGitOpsRepoUrl() },
    ];
    const jenkinsCI = this.ci as JenkinsCI;
    await Promise.all(
      jobs.map(job => jenkinsCI.createJob(job.name, this.folderName, job.url))
    );

    this.logComplete('Jenkins jobs creation');
  }
}

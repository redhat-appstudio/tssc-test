import { JenkinsCI } from "../../../core/integration/ci";
import { BaseCommand } from "./baseCommand";

export class TriggerJenkinsJobCommand extends BaseCommand {

    public async execute(): Promise<void> {
        this.logStart('Triggering Jenkins job');

        const jenkinsCI = this.ci as JenkinsCI;

        // Trigger the Jenkins job for the source repository
        await jenkinsCI.triggerPipeline(this.git.getSourceRepoName());

        // Trigger the Jenkins job for the GitOps repository
        await jenkinsCI.triggerPipeline(this.git.getGitOpsRepoName());

        this.logComplete('Jenkins jobs triggered successfully for source and GitOps repositories');
    }

}
import { CIType } from '../../../core/integration/ci/ciInterface';
import { ContentModifications } from '../../../modification/contentModification';
import { BaseCommand } from './baseCommand';

/**
 * Command to uncomment CUSTOM_ROOT_CA lines in CI configuration files
 * Supports Jenkins and GitHub Actions
 * Only executes if custom root CA is needed (self-signed cluster)
 */
export class UncommentCustomRootCA extends BaseCommand {
  public async execute(): Promise<void> {
    // Only uncomment if we have a custom root CA (self-signed cluster)
    const customRootCA = await this.getCustomRootCA();
    if (!customRootCA) {
      console.log('No custom root CA detected, skipping CUSTOM_ROOT_CA uncomment');
      return;
    }

    this.logStart('Uncomment CUSTOM_ROOT_CA in CI configuration files');

    const ciType = this.ci.getCIType();
    const ciFilePathInRepo = await this.ci.getCIFilePathInRepo();

    switch (ciType) {
      case CIType.JENKINS:
        await this.uncommentCustomRootCAInJenkins(ciFilePathInRepo);
        break;
      case CIType.GITHUB_ACTIONS:
        await this.uncommentCustomRootCAInGithubActions(ciFilePathInRepo);
        break;
      default:
        console.log(`Skipping CUSTOM_ROOT_CA uncomment for CI type: ${ciType}`);
        return;
    }

    this.logComplete('CUSTOM_ROOT_CA uncommented in CI configuration files');
  }

  /**
   * Uncomment CUSTOM_ROOT_CA in Jenkinsfile
   * @param ciFilePathInRepo The path to the Jenkinsfile in the repository
   */
  private async uncommentCustomRootCAInJenkins(ciFilePathInRepo: string): Promise<void> {
    const branch = 'main';

    // Update both source and gitops repositories
    await Promise.all([
      this.uncommentInJenkinsfile(this.git.getSourceRepoName(), ciFilePathInRepo, branch),
      this.uncommentInJenkinsfile(this.git.getGitOpsRepoName(), ciFilePathInRepo, branch),
    ]);
  }

  /**
   * Uncomment CUSTOM_ROOT_CA in a specific Jenkinsfile
   * @param repoName The repository name
   * @param ciFilePathInRepo The path to the Jenkinsfile in the repository
   * @param branch The branch to commit to
   */
  private async uncommentInJenkinsfile(
    repoName: string,
    ciFilePathInRepo: string,
    branch: string
  ): Promise<void> {
    // Get current file content
    const fileContent = await this.git.getFileContentInString(
      this.git.getRepoOwner(),
      repoName,
      ciFilePathInRepo,
      branch
    );

    // Find the commented CUSTOM_ROOT_CA line using regex (resilient to whitespace)
    const commentedPattern = /\/\*\s*CUSTOM_ROOT_CA\s*=\s*credentials\('CUSTOM_ROOT_CA'\)\s*\*\//;
    const match = fileContent.match(commentedPattern);

    if (!match) {
      console.log(`CUSTOM_ROOT_CA line not found or already uncommented in ${repoName} Jenkinsfile`);
      return;
    }

    const oldContent = match[0];
    const newContent = "CUSTOM_ROOT_CA = credentials('CUSTOM_ROOT_CA')";

    await this.uncommentInRepo(
      repoName,
      ciFilePathInRepo,
      branch,
      [{ oldContent, newContent }]
    );
  }

  /**
   * Uncomment CUSTOM_ROOT_CA in GitHub Actions workflow files
   * @param ciFilePathInRepo The path to the workflow files directory
   */
  private async uncommentCustomRootCAInGithubActions(ciFilePathInRepo: string): Promise<void> {
    const branch = 'main';
    const sourceCIFilePath = `${ciFilePathInRepo}/build-and-update-gitops.yml`;
    const gitopsCIFilePath = `${ciFilePathInRepo}/gitops-promotion.yml`;

    // Update both source and gitops repositories
    await Promise.all([
      this.uncommentInGithubActionsWorkflow(this.git.getSourceRepoName(), sourceCIFilePath, branch),
      this.uncommentInGithubActionsWorkflow(this.git.getGitOpsRepoName(), gitopsCIFilePath, branch),
    ]);
  }

  /**
   * Uncomment CUSTOM_ROOT_CA in a specific GitHub Actions workflow file
   * @param repoName The repository name
   * @param workflowFilePath The path to the workflow file
   * @param branch The branch to commit to
   */
  private async uncommentInGithubActionsWorkflow(
    repoName: string,
    workflowFilePath: string,
    branch: string
  ): Promise<void> {
    // Get current file content
    const fileContent = await this.git.getFileContentInString(
      this.git.getRepoOwner(),
      repoName,
      workflowFilePath,
      branch
    );

    const modifications: Array<{ oldContent: string; newContent: string }> = [];

    // Pattern 1: env variable declaration (line ~30 in source, ~18 in gitops)
    // Matches: # CUSTOM_ROOT_CA: ${{ vars.CUSTOM_ROOT_CA }}
    const envVarPattern = /#\s*CUSTOM_ROOT_CA:\s*\$\{\{\s*vars\.CUSTOM_ROOT_CA\s*\}\}/;
    const envVarMatch = fileContent.match(envVarPattern);

    if (envVarMatch) {
      modifications.push({
        oldContent: envVarMatch[0],
        newContent: "CUSTOM_ROOT_CA: ${{ vars.CUSTOM_ROOT_CA }}",
      });
    }

    // Pattern 2: vars object in script (line ~88 in source, ~70 in gitops)
    // Matches: /* CUSTOM_ROOT_CA: `${{ vars.CUSTOM_ROOT_CA }}`, */
    // Note: gitops version has no spaces around comment delimiters
    const scriptVarPattern = /\/\*\s*CUSTOM_ROOT_CA:\s*`\$\{\{\s*vars\.CUSTOM_ROOT_CA\s*\}\}`,?\s*\*\//;
    const scriptVarMatch = fileContent.match(scriptVarPattern);

    if (scriptVarMatch) {
      modifications.push({
        oldContent: scriptVarMatch[0],
        newContent: "CUSTOM_ROOT_CA: `${{ vars.CUSTOM_ROOT_CA }}`,",
      });
    }

    if (modifications.length === 0) {
      console.log(`CUSTOM_ROOT_CA lines not found or already uncommented in ${repoName} GitHub Actions workflow`);
      return;
    }

    await this.uncommentInRepo(
      repoName,
      workflowFilePath,
      branch,
      modifications
    );
  }

  /**
   * Uncomment CUSTOM_ROOT_CA lines in a repository file
   * @param repoName The repository name
   * @param filePath The file path in the repository
   * @param branch The branch to commit to
   * @param modifications The content modifications to apply
   */
  private async uncommentInRepo(
    repoName: string,
    filePath: string,
    branch: string,
    modifications: Array<{ oldContent: string; newContent: string }>
  ): Promise<void> {
    // Build content modifications object
    const contentModifications: ContentModifications = {
      [filePath]: modifications,
    };

    // Commit changes to the repo
    await this.git.commitChangesToRepo(
      this.git.getRepoOwner(),
      repoName,
      contentModifications,
      'Uncomment CUSTOM_ROOT_CA in CI configuration',
      branch
    );

    console.log(`Uncommented CUSTOM_ROOT_CA in ${repoName}/${filePath}`);
  }
}

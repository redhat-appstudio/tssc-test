import { ContentModifications } from '../../rhtap/modification/contentModification';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import { Buffer } from 'buffer';

// Add retry and throttling plugins to Octokit
const EnhancedOctokit = Octokit.plugin(retry, throttling);

export interface GithubClientOptions {
  token: string;
  baseUrl?: string;
  retryOptions?: {
    retries?: number;
    doNotRetry?: string[];
  };
  throttleOptions?: {
    maxRetries?: number;
  };
}

export class GithubClient {
  private octokit: Octokit;

  constructor(options: GithubClientOptions) {
    this.octokit = new EnhancedOctokit({
      auth: options.token,
      baseUrl: options.baseUrl || 'https://api.github.com',
      retry: {
        doNotRetry: options.retryOptions?.doNotRetry || ['404'],
        retries: options.retryOptions?.retries || 2,
        retryAfter: 3, // Seconds to wait between retries
      },
      throttle: {
        onRateLimit: (retryAfter, requestOptions, octokit, retryCount) => {
          octokit.log.warn(
            `Request quota exhausted for request ${requestOptions.method} ${requestOptions.url}`
          );

          if (retryCount < (options.throttleOptions?.maxRetries || 2)) {
            // Retry on rate limit errors
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
        onSecondaryRateLimit: (retryAfter, requestOptions, octokit, retryCount) => {
          octokit.log.warn(
            `SecondaryRateLimit detected for request ${requestOptions.method} ${requestOptions.url}`
          );

          if (retryCount < (options.throttleOptions?.maxRetries || 2)) {
            // Retry on secondary rate limits
            octokit.log.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
          return false;
        },
      },
    });
    // this.octokit = new Octokit({
    //   auth: options.token,
    //   baseUrl: options.baseUrl || 'https://api.github.com',
    // });
  }

  public getOctokit(): Octokit {
    return this.octokit;
  }

  // Repository methods
  public async getRepository(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({
      owner,
      repo,
    });
    return data;
  }

  // Pull Request methods
  public async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ) {
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state,
    });
    return data;
  }

  /**
   * Gets pull request details
   * @param owner Repository owner
   * @param repo Repository name
   * @param pullNumber Pull request number
   */
  public async getPullRequest(owner: string, repo: string, pullNumber: number) {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return data;
  }

  // Content methods
  public async getContent(owner: string, repo: string, path: string, ref?: string) {
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    return data;
  }

  /**
   * Creates a pull request with specified file modifications to an original repository.
   *
   * @param originalRepoOwner - Owner of the target repository (organization or username)
   * @param originalRepoName - Name of the target repository
   * @param yourGithubUsername - Your GitHub username (for creating the fork/branch)
   * @param baseBranch - The branch to create the PR against (e.g., 'main', 'master')
   * @param newBranchName - Name for the new branch that will contain your changes
   * @param contentModifications - Object mapping file paths to arrays of modification objects
   *        Each modification contains oldContent (string to find) and newContent (replacement)
   * @param pullRequestTitle - Title for the pull request and commit message
   * @param pullRequestBody - Description for the pull request
   *
   * @returns Promise resolving to an object containing the PR number and commit SHA if successful
   * @throws Error if any part of the process fails
   *
   * @example
   * const result = await githubClient.createPullRequest(
   *   'octocat',
   *   'hello-world',
   *   'myusername',
   *   'main',
   *   'feature/update',
   *   {
   *     'README.md': [{
   *       oldContent: '# Hello World',
   *       newContent: '# Hello World\n\nThis is an updated readme.'
   *     }],
   *     'src/config.js': [
   *       {
   *         oldContent: "const API_URL = 'https://api.dev.example.com';",
   *         newContent: "const API_URL = 'https://api.prod.example.com';"
   *       },
   *       {
   *         oldContent: "const DEBUG = false;",
   *         newContent: "const DEBUG = true;"
   *       }
   *     ]
   *   },
   *   'Update configuration',
   *   'This PR updates the README and config settings.'
   * );
   */
  public async createPullRequest(
    originalRepoOwner: string,
    originalRepoName: string,
    yourGithubUsername: string,
    baseBranch: string,
    newBranchName: string,
    contentModifications: ContentModifications,
    pullRequestTitle: string,
    pullRequestBody: string
  ): Promise<{ prNumber: number; commitSha: string }> {
    try {
      const getRefResponse = await this.octokit.rest.git.getRef({
        owner: originalRepoOwner,
        repo: originalRepoName,
        ref: `heads/${baseBranch}`,
      });
      const latestCommitSha = getRefResponse.data.object.sha;

      const getCommitResponse = await this.octokit.rest.git.getCommit({
        owner: originalRepoOwner,
        repo: originalRepoName,
        commit_sha: latestCommitSha,
      });
      const baseTreeSha = getCommitResponse.data.tree.sha;

      const treeItems: {
        path: string;
        mode: '100644' | '100755' | '040000' | '160000' | '120000';
        type: 'blob' | 'tree' | 'commit';
        sha?: string;
        content?: string;
      }[] = [];

      for (const filePath of Object.keys(contentModifications)) {
        const getContentResponse = await this.octokit.rest.repos.getContent({
          owner: originalRepoOwner,
          repo: originalRepoName,
          path: filePath,
          ref: baseBranch,
        });

        if (
          getContentResponse.data &&
          'content' in getContentResponse.data &&
          typeof getContentResponse.data.content === 'string'
        ) {
          let fileContent = Buffer.from(getContentResponse.data.content, 'base64').toString(
            'utf-8'
          );

          // Apply each modification in the array sequentially
          const modifications = contentModifications[filePath];
          for (const mod of modifications) {
            fileContent = fileContent.replace(mod.oldContent, mod.newContent);
          }

          const createBlobResponse = await this.octokit.rest.git.createBlob({
            owner: yourGithubUsername,
            repo: originalRepoName,
            content: fileContent,
            encoding: 'utf-8',
          });
          const newBlobSha = createBlobResponse.data.sha;

          treeItems.push({
            path: filePath,
            mode: '100644',
            type: 'blob',
            sha: newBlobSha,
          });
        } else {
          console.error(`Could not retrieve content for file: ${filePath}`);
          throw new Error(`Could not retrieve content for file: ${filePath}`);
        }
      }

      const createTreeResponse = await this.octokit.rest.git.createTree({
        owner: yourGithubUsername,
        repo: originalRepoName,
        base_tree: baseTreeSha,
        tree: treeItems,
      });
      const newTreeSha = createTreeResponse.data.sha;

      const createCommitResponse = await this.octokit.rest.git.createCommit({
        owner: yourGithubUsername,
        repo: originalRepoName,
        message: pullRequestTitle, // Using PR title as commit message for simplicity
        tree: newTreeSha,
        parents: [latestCommitSha],
      });
      const newCommitSha = createCommitResponse.data.sha;

      try {
        await this.octokit.rest.git.createRef({
          owner: yourGithubUsername,
          repo: originalRepoName,
          ref: `refs/heads/${newBranchName}`,
          sha: newCommitSha,
        });
        console.log(`Successfully created branch: ${newBranchName} in your fork.`);
      } catch (error: any) {
        console.warn(`Branch ${newBranchName} might already exist in your fork: ${error.message}`);
        // Consider adding logic to update the branch if needed
      }

      const createPullResponse = await this.octokit.rest.pulls.create({
        owner: originalRepoOwner,
        repo: originalRepoName,
        head: `${yourGithubUsername}:${newBranchName}`,
        base: baseBranch,
        title: pullRequestTitle,
        body: pullRequestBody,
      });

      console.log(`Successfully created pull request: ${createPullResponse.data.html_url}`);
      return {
        prNumber: createPullResponse.data.number,
        commitSha: newCommitSha,
      };
    } catch (error: any) {
      console.error(`Error creating pull request and updating files: ${error.message}`);
      throw error;
    }
  }

  /**
   * Merges a pull request in a GitHub repository
   * @param owner Repository owner
   * @param repo Repository name
   * @param pullNumber Pull request number
   * @returns Merge response with SHA
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ sha: string; message: string }> {
    try {
      const response = await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        merge_method: 'merge',
      });

      return {
        sha: response.data.sha,
        message: response.data.message,
      };
    } catch (error) {
      console.error(`Failed to merge pull request #${pullNumber}: ${error}`);
      throw error;
    }
  }

  /**
   * Gets the public key for encrypting secrets for GitHub Actions in a repository.
   * This key is needed to encrypt secrets before they can be added to a repository.
   *
   * @param repoOwner - The owner (organization or user) of the repository
   * @param repoName - The name of the repository
   * @returns Promise resolving to an object containing the public key and its ID
   * @throws Error if the request fails
   *
   * @example
   * const { key, key_id } = await githubClient.getRepoPublicKey('octocat', 'hello-world');
   * // Use the key to encrypt a secret value before adding it to the repository
   */
  public async getRepoPublicKey(
    repoOwner: string,
    repoName: string
  ): Promise<{ key: string; key_id: string }> {
    try {
      const response = await this.octokit.actions.getRepoPublicKey({
        owner: repoOwner,
        repo: repoName,
      });

      return {
        key: response.data.key,
        key_id: response.data.key_id,
      };
    } catch (error: any) {
      console.error(
        `Failed to get public key for repository ${repoOwner}/${repoName}: ${error.message}`
      );
      throw error;
    }
  }

  public async commit(
    repoOwner: string,
    sourceRepoName: string,
    modifications: ContentModifications | ContentModifications[],
    message: string,
    branch: string = 'main'
  ): Promise<string> {
    console.log(`Committing changes to branch '${branch}' with message: ${message}`);
    try {
      // Get the reference to the specified branch
      const { data: refData } = await this.octokit.git.getRef({
        owner: repoOwner,
        repo: sourceRepoName,
        ref: `heads/${branch}`,
      });
      const latestCommitSha = refData.object.sha;

      // Get the commit that the branch currently points to
      const { data: commitData } = await this.octokit.git.getCommit({
        owner: repoOwner,
        repo: sourceRepoName,
        commit_sha: latestCommitSha,
      });
      const baseTreeSha = commitData.tree.sha;

      // Convert single modification object to array for uniform processing
      const modificationsArray = Array.isArray(modifications) ? modifications : [modifications];

      // Create a map to collect all file paths and their modifications
      const fileModificationsMap = new Map<string, { oldContent: string; newContent: string }[]>();

      // Process each ContentModifications object
      for (const modification of modificationsArray) {
        // Process each file in this modification object
        for (const [filePath, changes] of Object.entries(modification)) {
          // Get or create the array of changes for this file
          if (!fileModificationsMap.has(filePath)) {
            fileModificationsMap.set(filePath, []);
          }

          const fileChanges = fileModificationsMap.get(filePath)!;

          // Add each change to the file's changes array
          for (const change of changes as Array<{ oldContent: string; newContent: string }>) {
            fileChanges.push({
              oldContent: change.oldContent,
              newContent: change.newContent,
            });
          }
        }
      }

      // Process each file in the merged modifications map
      const treeItems: {
        path: string;
        mode: '100644' | '100755' | '040000' | '160000' | '120000';
        type: 'blob' | 'tree' | 'commit';
        sha?: string;
        content?: string;
      }[] = [];

      for (const [filePath, changes] of fileModificationsMap.entries()) {
        try {
          // Get current file content using the specified branch
          const fileContentResponse = await this.octokit.repos.getContent({
            owner: repoOwner,
            repo: sourceRepoName,
            path: filePath,
            ref: branch,
          });

          if (!fileContentResponse.data || !('content' in fileContentResponse.data)) {
            throw new Error(`Could not retrieve content for file: ${filePath}`);
          }

          // Decode the content from base64
          let currentContent = Buffer.from(fileContentResponse.data.content, 'base64').toString(
            'utf-8'
          );

          // Apply each modification in sequence
          for (const change of changes) {
            currentContent = currentContent.replace(change.oldContent, change.newContent);
          }

          // Create blob for the modified content
          const { data: blobData } = await this.octokit.git.createBlob({
            owner: repoOwner,
            repo: sourceRepoName,
            content: currentContent,
            encoding: 'utf-8',
          });

          // Add the blob to our tree
          treeItems.push({
            path: filePath,
            mode: '100644', // File mode (standard file)
            type: 'blob',
            sha: blobData.sha,
          });
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
          throw error;
        }
      }

      // Create a tree with all file changes
      const { data: treeData } = await this.octokit.git.createTree({
        owner: repoOwner,
        repo: sourceRepoName,
        base_tree: baseTreeSha,
        tree: treeItems,
      });

      // Create a commit with the new tree
      const { data: newCommitData } = await this.octokit.git.createCommit({
        owner: repoOwner,
        repo: sourceRepoName,
        message: message,
        tree: treeData.sha,
        parents: [latestCommitSha],
      });

      // Update the reference to the specified branch
      await this.octokit.git.updateRef({
        owner: repoOwner,
        repo: sourceRepoName,
        ref: `heads/${branch}`,
        sha: newCommitData.sha,
      });

      console.log(
        `Changes committed successfully to ${repoOwner}/${sourceRepoName} branch '${branch}' with commit SHA: ${newCommitData.sha}`
      );
      return newCommitData.sha;
    } catch (error) {
      console.error(`Failed to commit changes to branch '${branch}': ${error}`);
      throw error;
    }
  }

  /**
   * Extracts content from a file that matches a regular expression pattern
   *
   * @param repoOwner - The owner (organization or user) of the repository
   * @param repoName - The name of the repository
   * @param filePath - Path to the file in the repository
   * @param searchPattern - Regular expression pattern to search for in the file
   * @param branch - Branch to search in (default: 'main')
   * @returns Promise resolving to an array of matches (empty array if no matches or file not found)
   *
   * @example
   * // Extract the image value from a YAML file
   * const imageValues = await githubClient.extractContentByRegex(
   *   'xjiangorg',
   *   'go-udqvvune-gitops',
   *   'components/go-udqvvune/overlays/development/deployment-patch.yaml',
   *   /(?:^|\s+)-\s+image:\s+(.+)$/m
   * );
   */
  public async extractContentByRegex(
    repoOwner: string,
    repoName: string,
    filePath: string,
    searchPattern: RegExp,
    branch: string = 'main'
  ): Promise<string[]> {
    try {
      console.log(`Searching for pattern ${searchPattern} in file ${filePath} (${branch} branch)`);

      // Get the file content
      const fileContentResponse = await this.octokit.repos.getContent({
        owner: repoOwner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      if (!fileContentResponse.data || !('content' in fileContentResponse.data)) {
        console.log(`Could not retrieve content for file: ${filePath}`);
        return [];
      }

      // Decode the content from base64
      const content = Buffer.from(fileContentResponse.data.content, 'base64').toString('utf-8');

      // Search for the pattern
      const matches = content.match(searchPattern);

      if (!matches) {
        console.log(`No matches found in file ${filePath}`);
        return [];
      }

      console.log(`Found ${matches.length} matches in ${filePath}`);
      return matches;
    } catch (error) {
      console.error(`Error extracting content with regex from ${filePath}: ${error}`);
      return [];
    }
  }

  /**
   * Gets the SHA256 commit hash for a specific branch of a repository
   *
   * @param repoOwner - The owner (organization or user) of the repository
   * @param repoName - The name of the repository
   * @param branch - The branch name to get the commit hash for (default: 'main')
   * @returns Promise resolving to the SHA256 commit hash of the latest commit in the branch
   * @throws Error if the request fails
   *
   * @example
   * const commitSha = await githubClient.getBranchCommitSha('octocat', 'hello-world', 'feature-branch');
   * console.log(`Latest commit on branch: ${commitSha}`);
   */
  public async getBranchCommitSha(
    repoOwner: string,
    repoName: string,
    branch: string = 'main'
  ): Promise<string> {
    try {
      console.log(`Getting latest commit SHA for ${repoOwner}/${repoName} branch '${branch}'`);

      const response = await this.octokit.repos.getBranch({
        owner: repoOwner,
        repo: repoName,
        branch: branch,
      });

      const commitSha = response.data.commit.sha;
      console.log(`Latest commit SHA for branch '${branch}': ${commitSha}`);

      return commitSha;
    } catch (error: any) {
      console.error(`Failed to get commit SHA for branch '${branch}': ${error.message}`);
      throw error;
    }
  }

  public async configWebhook(
    repoOwner: string,
    repoName: string,
    webhookUrl: string
  ): Promise<void> {
    try {
      console.log(`Configuring webhook for ${repoOwner}/${repoName} at ${webhookUrl}`);

      await this.octokit.repos.createWebhook({
        owner: repoOwner,
        repo: repoName,
        config: {
          url: webhookUrl,
          content_type: 'form',
          insecure_ssl: '1', // Use '0' for secure SSL
        },
        events: ['push', 'pull_request'],
        active: true,
      });
      console.log(`Webhook configured successfully for ${repoOwner}/${repoName}`);
    } catch (error) {
      console.error(`Failed to configure webhook for ${repoOwner}/${repoName}: ${error}`);
      throw error;
    }
  }

  /**
   * Sets or updates repository variables in GitHub Actions.
   * @param owner - The GitHub organization or user.
   * @param repo - The repository name.
   * @param variables - An object of variableName: variableValue pairs.
   * @returns An object summarizing created, updated, and failed variables.
   */
  public async setRepoVariables(
    owner: string,
    repo: string,
    variables: Record<string, string>
  ): Promise<{ created: string[]; updated: string[]; failed: string[] }> {
    console.group(`Setting repo variables for ${owner}/${repo}`);
    const created: string[] = [];
    const updated: string[] = [];
    const failed: string[] = [];

    // Fetch all existing variables (with pagination)
    let existingVariables: Record<string, string> = {};
    let page = 1;
    try {
      while (true) {
        const response = await this.octokit.actions.listRepoVariables({
          owner,
          repo,
          per_page: 100,
          page,
        });
        for (const v of response.data.variables) {
          existingVariables[v.name] = v.value;
        }
        if (response.data.total_count <= page * 100) break;
        page++;
      }
    } catch (error) {
      console.error(`Error listing variables: ${error}`);
      console.groupEnd();
      throw error;
    }

    for (const [name, value] of Object.entries(variables)) {
      try {
        if (name in existingVariables) {
          if (existingVariables[name] === value) {
            console.log(`Variable "${name}" already set to desired value, skipping.`);
            continue;
          }
          // Update existing variable
          await this.octokit.actions.updateRepoVariable({
            owner,
            repo,
            name,
            value,
          });
          updated.push(name);
          console.log(`Updated variable: ${name}`);
        } else {
          // Create new variable
          await this.octokit.actions.createRepoVariable({
            owner,
            repo,
            name,
            value,
          });
          created.push(name);
          console.log(`Created variable: ${name}`);
        }
      } catch (error) {
        failed.push(name);
        console.error(`Error setting variable "${name}": ${error}`);
      }
    }
    console.groupEnd();
    return { created, updated, failed };
  }

  /**
   * Sets or updates a single repository variable in GitHub Actions.
   * @param owner - The GitHub organization or user.
   * @param repo - The repository name.
   * @param name - The variable name.
   * @param value - The variable value.
   * @returns A string indicating if the variable was 'created' or 'updated'.
   * @throws Error if the operation fails.
   */
  public async setRepoVariable(
    owner: string,
    repo: string,
    name: string,
    value: string
  ): Promise<'created' | 'updated'> {
    console.log(`Setting repo variable "${name}" for ${owner}/${repo}`);

    try {
      // Get all existing variables first (only one API call)
      const existingVariables: Record<string, string> = {};
      const response = await this.octokit.actions.listRepoVariables({
        owner,
        repo,
        per_page: 100,
      });

      // Build a map of existing variables
      for (const v of response.data.variables) {
        existingVariables[v.name] = v.value;
      }

      // Check if our variable exists and has the same value
      if (name in existingVariables) {
        if (existingVariables[name] === value) {
          console.log(`Variable "${name}" already set to desired value, skipping.`);
          return 'updated'; // Return updated even though no change was made
        }

        // Update existing variable
        await this.octokit.actions.updateRepoVariable({
          owner,
          repo,
          name,
          value,
        });
        console.log(`Updated variable: ${name}`);
        return 'updated';
      } else {
        // Create new variable
        await this.octokit.actions.createRepoVariable({
          owner,
          repo,
          name,
          value,
        });
        console.log(`Created variable: ${name}`);
        return 'created';
      }
    } catch (error) {
      console.error(`Error setting variable "${name}": ${error}`);
      throw error;
    }
  }
}

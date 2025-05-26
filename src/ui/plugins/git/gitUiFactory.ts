/**
 * Git UI Plugin Factory
 * 
 * Factory class for creating UI-specific Git provider implementations.
 * Handles instantiation of the appropriate UI plugin based on Git provider type.
 */

import { Git, GitType } from '../../../rhtap/core/integration/git/gitInterface';
import { GithubUiPlugin } from './github';
import { GitlabUiPlugin } from './gitlab';
import { GitPlugin } from './gitUiInterface';

export class GitUiFactory {
    /**
     * Creates a Git UI plugin instance based on the Git type.
     * 
     * @param gitType - The type of Git provider (GitHub/GitLab)
     * @param git - The core Git provider instance to wrap
     * @returns A Promise resolving to the appropriate GitPlugin instance
     * @throws Error if the Git type is not supported
     */
    static async createGitPlugin(
        gitType: GitType,
        git: Git
    ): Promise<GitPlugin> {
        switch (gitType) {
            case GitType.GITHUB:
                return new GithubUiPlugin(git);
            case GitType.GITLAB:
                return new GitlabUiPlugin(git);
            default:
                throw new Error(`Unsupported Git type: ${gitType}`);
        }
    }
} 
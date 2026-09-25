/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Extracts the repository name from a GitHub repository URL.
 * @license Apache-2.0
 */

const REPO_REGEX = /^(?:https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?|git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?)$/;

/**
 * Extracts the repository name from its URL.
 * @param repo - The repository URL.
 * @returns The repository name.
 */
export function getRepoName(repo: string): string {
    const match = repo.match(REPO_REGEX);
    if (match) {
        const user = match[1] || match[3];
        const repoName = match[2] || match[4];
        return `${user}.${repoName}`;
    }

    throw new Error(`Invalid repository URL: "${repo}"`);
}
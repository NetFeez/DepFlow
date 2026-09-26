/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Dependency source utilities: git repository URL validation and identifier derivation.
 * @license Apache-2.0
 */
export namespace DepUtils {
    /**
     * The shape of a dependency repository: a github URL in HTTPS or SSH form.
     */
    export type Repo = `https://github.com/${string}/${string}.git` | `git@github.com:${string}/${string}.git`;

    /**
     * Matches any git-cloneable URL, in the forms `git` itself accepts.
     */
    const GIT_URL_REGEX = /^(?:(?:https?|git|ssh|rsync|file|git@[-\w.]+):(\/\/)?)([\w.@:/\-~]+)(\.git)(\/)?$/;

    /**
     * Matches a github repository URL and captures its user and name, tolerating a missing `.git` suffix.
     */
    const GITHUB_REPO_REGEX = /^(?:https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?|git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?)$/;

    /**
     * Validates that the provided repository URL is a non-empty string and matches common Git repository URL patterns. It checks for both HTTPS and SSH formats, ensuring that the URL is well-formed and points to a valid Git repository.
     * If the validation fails, it throws an error with a descriptive message indicating the issue with the provided repository URL.
     * @param repo - The repository URL to validate.
     * @throws Will throw an error if the repository URL is invalid.
     */
    export function repo(repo: unknown): asserts repo is Repo {
        if (typeof repo !== 'string' || !repo.trim()) throw new Error(`Invalid repository URL: "${repo}"`);
        if (!GIT_URL_REGEX.test(repo)) throw new Error(`Invalid repository URL: ${repo}`);
    }

    /**
     * Extracts the repository name from its URL.
     * @param repo - The repository URL.
     * @returns The repository name.
     */
    export function getRepoName(repo: string): string {
        const match = repo.match(GITHUB_REPO_REGEX);
        if (match) {
            const user = match[1] || match[3];
            const repoName = match[2] || match[4];
            return `${user}.${repoName}`;
        }

        throw new Error(`Invalid repository URL: "${repo}"`);
    }
}

export default DepUtils;

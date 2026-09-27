/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Dependency source utilities: git repository validation and identity derivation.
 * @license Apache-2.0
 */
export namespace DepUtils {
    /**
     * Anything `git clone` accepts as a repository: a remote over one of the transports it speaks, or
     * a local path of a repository. The name of a dependency is never derived from it, only the repo
     * itself is.
     *
     * @remarks Every transport is spelled out so the accepted shapes are readable, but the `.git`
     * suffix is what all of them share and what {@link DepUtils.repo} enforces, so the last member is
     * the one that decides.
     */
    export type Repo =
        | `https://${string}.git`
        | `http://${string}.git`
        | `ssh://${string}.git`
        | `git://${string}.git`
        | `file://${string}.git`
        | `git@${string}.git`
        | `${string}.git`;

    /**
     * Matches what `git clone` accepts, in the transports it speaks: a URL with its scheme, an SCP
     * like address, or a local path of a repository.
     */
    const CLONEABLE_REGEX = /^(?:(?:https?|ssh|git|file):\/\/|git@)\S+$|\S*\.git$/;

    /**
     * Matches a github repository URL and captures its user and name, tolerating a missing `.git` suffix.
     */
    const GITHUB_REPO_REGEX = /^(?:https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?|git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?)$/;

    /**
     * The suffix that tells a repository from anything else, checked on the value as a whole instead of
     * anchoring it, so a local path of a repository keeps validating wherever it lives.
     */
    const GIT_SUFFIX_REGEX = /\.git$/;

    /**
     * Validates that the provided value is a repository `git clone` accepts, and says what it is not when
     * it does not: a URL with its scheme, an SCP like address or a local path of a repository.
     * @param repo - The repository value to validate.
     * @throws Will throw an error if the value is not a clonable repository.
     *
     * @remarks A repository always carries the `.git` suffix, whichever transport it comes in: it is what
     * tells a repository apart from a page, a package or a folder, and the name of the dependency is
     * derived from the same suffix, so both read one repository.
     *
     * @example
     * ```ts
     * DepUtils.repo('https://github.com/NetFeez/omega.git');
     * ```
     */
    export function repo(repo: unknown): asserts repo is Repo {
        if (typeof repo !== 'string' || !repo.trim()) throw new Error(`Not a clonable git repository: "${repo}".`);
        if (!CLONEABLE_REGEX.test(repo) || !GIT_SUFFIX_REGEX.test(repo.trim())) throw new Error(`Not a clonable git repository: "${repo}". Pass a repository ending in .git, a URL git can clone, an ssh address or a local path of a repository.`);
    }

    /**
     * Extracts the name a dependency is known by from its repository URL.
     *
     * Only a GitHub repository has a name that can be derived without asking, and the name it derives
     * is the one the alias of the dependency takes everywhere else, so it is derived here and nowhere
     * else.
     * @param repo - The repository URL.
     * @returns The repository name, as `<user>.<name>`.
     * @throws { Error } When the repository is not a GitHub one, saying the name has to be given.
     *
     * @example
     * ```ts
     * DepUtils.getRepoName('https://github.com/NetFeez/omega.git'); // 'NetFeez.omega'
     * ```
     */
    export function getRepoName(repo: string): string {
        const match = repo.match(GITHUB_REPO_REGEX);
        if (match) {
            const user = match[1] || match[3];
            const repoName = match[2] || match[4];
            return `${user}.${repoName}`;
        }

        throw new Error(`Cannot derive a name from "${repo}": only GitHub repositories are named automatically, pass the name yourself.`);
    }
}

export default DepUtils;

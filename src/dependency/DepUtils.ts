/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Dependency source utilities: git repository validation and identity derivation.
 * @license Apache-2.0
 */
export namespace DepUtils {
    /**
     * A repository in the canonical form `git clone` accepts: a remote over one of the transports it
     * speaks, or a local path of a repository, always ending in `.git`. The name of a dependency is
     * never derived from it, only the repo itself is.
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
     * What a repository reference resolves to: the URL `git clone` is given and the name GitHub
     * derives from it.
     */
    export interface Reference {
        /** The repository, canonical: a value {@link DepUtils.Repo} accepts whatever form it came in. */
        repo: Repo;

        /** The `<user>/<name>` GitHub derives, or `null` when the reference is not a GitHub one. **/
        name: string | null;
    }

    /**
     * Matches what `git clone` accepts, in the transports it speaks: a URL with its scheme, an SCP
     * like address, or a local path of a repository.
     */
    const CLONEABLE_REGEX = /^(?:(?:https?|ssh|git|file):\/\/|git@)\S+$|\S*\.git$/;

    /**
     * Matches a GitHub repository over HTTP, with or without the `.git` suffix, and captures its user
     * and name.
     */
    const GITHUB_HTTP_REGEX = /^(https?):\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

    /**
     * Matches a GitHub repository over SSH in the SCP like form, with or without the `.git` suffix and
     * tolerating the stray slash some clients write after the colon (`git@github.com:/user/repo`).
     */
    const GITHUB_SSH_REGEX = /^git@github\.com:?\/?([^/]+)\/([^/]+?)(?:\.git)?$/;

    /**
     * Matches the bare `user/repo` shorthand GitHub itself accepts, without a scheme and with or
     * without the `.git` suffix.
     */
    const GITHUB_SHORT_REGEX = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?$/;

    /**
     * The suffix that tells a repository from anything else, checked on the value as a whole instead of
     * anchoring it, so a local path of a repository keeps validating wherever it lives.
     */
    const GIT_SUFFIX_REGEX = /\.git$/;

    /**
     * The failure every rejected reference is reported with, so a caller sees what was expected of it.
     * @param reference - The value that was refused.
     * @returns The error describing what a repository reference may be.
     **/
    function notClonable(reference: unknown): Error {
        return new Error(`Not a clonable git repository: "${reference}". Pass a user/repo pair, a repository ending in .git, a URL git can clone, an ssh address or a local path of a repository.`);
    }

    /**
     * Parses a repository reference into the repository git clones from and the name GitHub derives.
     *
     * A GitHub repository may be written as the bare `user/repo` shorthand, as an HTTP(S) URL or as an
     * SCP like ssh address, with or without the `.git` suffix; every one of them is canonicalized to
     * the same repository. Any other repository is accepted as it stands when it is a value
     * {@link DepUtils.Repo} accepts, and carries no derivable name.
     * @param reference - The repository reference as a user writes it.
     * @returns The canonical repository and the derived name, `null` when there is none.
     * @throws { Error } When the reference is not a clonable repository.
     *
     * @example
     * ```ts
     * DepUtils.parse('netfeez/omega');
     * // { repo: 'https://github.com/netfeez/omega.git', name: 'netfeez/omega' }
     * ```
     */
    export function parse(reference: string): Reference {
        if (typeof reference !== 'string' || !reference.trim()) throw notClonable(reference);
        const value = reference.trim();

        const http = value.match(GITHUB_HTTP_REGEX);
        if (http) return { repo: `${http[1]}://github.com/${http[2]}/${http[3]}.git` as Repo, name: `${http[2]}/${http[3]}` };

        const ssh = value.match(GITHUB_SSH_REGEX);
        if (ssh) return { repo: `git@github.com:${ssh[1]}/${ssh[2]}.git` as Repo, name: `${ssh[1]}/${ssh[2]}` };

        const short = value.match(GITHUB_SHORT_REGEX);
        if (short) return { repo: `https://github.com/${short[1]}/${short[2]}.git` as Repo, name: `${short[1]}/${short[2]}` };

        if (!CLONEABLE_REGEX.test(value) || !GIT_SUFFIX_REGEX.test(value)) throw notClonable(value);
        return { repo: value as Repo, name: null };
    }

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
     * Extracts the name a dependency is known by from its repository reference.
     *
     * Only a GitHub repository has a name that can be derived without asking, and the name it derives
     * is the one the alias of the dependency takes everywhere else, so it is derived here and nowhere
     * else.
     * @param repo - The repository reference, in any of the forms {@link DepUtils.parse} accepts.
     * @returns The repository name, as `<user>/<name>`.
     * @throws { Error } When the repository is not a GitHub one, saying the name has to be given.
     *
     * @example
     * ```ts
     * DepUtils.getRepoName('https://github.com/NetFeez/omega.git'); // 'NetFeez/omega'
     * ```
     */
    export function getRepoName(repo: string): string {
        const { name } = parse(repo);
        if (!name) throw new Error(`Cannot derive a name from "${repo}": only GitHub repositories are named automatically, pass the name yourself.`);
        return name;
    }
}

export default DepUtils;

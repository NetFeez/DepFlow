/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Dependency source utilities: git repository validation and identity derivation.
 * @license Apache-2.0
 */
import { Path } from '@netfeez/common-node';

export namespace DepUtils {
    /**
     * A repository in the canonical form `git clone` accepts over a transport it speaks, always ending
     * in `.git`.
     */
    export type RemoteRepo =
        | `https://${string}.git`
        | `http://${string}.git`
        | `ssh://${string}.git`
        | `git://${string}.git`
        | `git@${string}.git`;

    /** A local repository addressed by a `file://` URL. **/
    export type FileRepo = `file://${string}`;

    /** A local repository addressed by a path relative to the project root. **/
    export type RelativeRepo = `./${string}`;

    /** A local repository addressed by an absolute path. **/
    export type AbsoluteRepo = `/${string}`;

    /** A local repository: `file://`, `./` or `/`. **/
    export type LocalRepo = FileRepo | RelativeRepo | AbsoluteRepo;

    /** A repository reference: a remote git transport or a local path. **/
    export type Repo = RemoteRepo | LocalRepo;

    /**
     * What a repository reference resolves to: the value `git clone` is given and the name GitHub
     * derives from it.
     */
    export interface Reference {
        /** The repository, canonical: a value {@link DepUtils.Repo} accepts whatever form it came in. */
        repo: Repo;

        /** The `<user>/<name>` GitHub derives, or `null` when the reference is not a GitHub one. **/
        name: string | null;
    }

    /**
     * The prefixes that tell a local path from a remote repository.
     *
     * @remarks Only these three forms are local. A bare `user/repo` is not accepted as a shorthand,
     * so it can never be confused with a relative path: a local one must be written as `./user/repo`
     * and a remote one as a URL git can clone.
     */
    const LOCAL_REGEX = /^(?:file:\/\/|\.\/|\/)/;

    /**
     * Matches what `git clone` accepts over a transport that is not the local file system.
     */
    const CLONEABLE_REGEX = /^(?:(?:https?|ssh|git):\/\/|git@)\S+$/;

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
     * The suffix that tells a remote repository from anything else.
     */
    const GIT_SUFFIX_REGEX = /\.git$/;

    /**
     * The failure every rejected reference is reported with, so a caller sees what was expected of it.
     * @param reference - The value that was refused.
     * @returns The error describing what a repository reference may be.
     **/
    function notClonable(reference: unknown): Error {
        return new Error(`Not a clonable git repository: "${reference}". Pass a URL git can clone ending in .git, an ssh address, or a local path written as file://…, ./… or /…. The user/repo shorthand is not accepted.`);
    }

    /**
     * Normalizes a local reference to forward slashes and strips a trailing separator.
     * @param reference - The local reference as it was written.
     * @returns The local reference, canonical.
     * @throws { Error } When the reference carries no path after its prefix.
     *
     * @remarks A `file://` URL is normalized on its path alone, because normalizing the whole value
     * would collapse the `//` of the scheme itself.
     **/
    function normalizeLocal(reference: string): LocalRepo {
        if (reference.startsWith('file://')) {
            const path = Path.toPosix(Path.clean(reference.slice('file://'.length)));
            if (!path) throw notClonable(reference);
            return `file://${path}` as FileRepo;
        }

        const path = Path.toPosix(Path.clean(reference));
        if (!path || path === '.' || path === '/') throw notClonable(reference);
        return path as LocalRepo;
    }

    /**
     * Canonicalizes a repository reference to the value `git clone` is given.
     * @param reference - The repository reference as a user writes it.
     * @returns The canonical repository.
     * @throws { Error } When the reference is not a clonable repository.
     *
     * @remarks A local reference keeps its `./` or `/` form and is resolved against the project root
     * when it is cloned; a `file://` one keeps its scheme. A GitHub URL is canonicalized to the
     * repository git clones from, always ending in `.git`. The `user/repo` shorthand is not accepted.
     */
    export function normalize(reference: string): Repo {
        if (typeof reference !== 'string' || !reference.trim()) throw notClonable(reference);
        const value = reference.trim();

        if (LOCAL_REGEX.test(value)) return normalizeLocal(value);

        const http = value.match(GITHUB_HTTP_REGEX);
        if (http) return `${http[1]}://github.com/${http[2]}/${http[3]}.git` as Repo;

        const ssh = value.match(GITHUB_SSH_REGEX);
        if (ssh) return `git@github.com:${ssh[1]}/${ssh[2]}.git` as Repo;

        if (!CLONEABLE_REGEX.test(value) || !GIT_SUFFIX_REGEX.test(value)) throw notClonable(value);
        return value as Repo;
    }

    /**
     * Parses a repository reference into the repository git clones from and the name GitHub derives.
     *
     * A GitHub repository may be written as an HTTP(S) URL or as an SCP like ssh address, with or
     * without the `.git` suffix; both are canonicalized to the same repository. A local reference
     * (`file://`, `./` or `/`) carries no derivable name, and neither does any other remote.
     * @param reference - The repository reference as a user writes it.
     * @returns The canonical repository and the derived name, `null` when there is none.
     * @throws { Error } When the reference is not a clonable repository.
     *
     * @example
     * ```ts
     * DepUtils.parse('https://github.com/netfeez/omega');
     * // { repo: 'https://github.com/netfeez/omega.git', name: 'netfeez/omega' }
     * ```
     */
    export function parse(reference: string): Reference {
        if (typeof reference !== 'string' || !reference.trim()) throw notClonable(reference);
        const value = reference.trim();
        const repo = normalize(value);

        if (LOCAL_REGEX.test(value)) return { repo, name: null };

        const http = value.match(GITHUB_HTTP_REGEX);
        if (http) return { repo, name: `${http[2]}/${http[3]}` };

        const ssh = value.match(GITHUB_SSH_REGEX);
        if (ssh) return { repo, name: `${ssh[1]}/${ssh[2]}` };

        return { repo, name: null };
    }

    /**
     * Validates that the provided value is a repository `git clone` accepts, and says what it is not
     * when it does not: a URL with its scheme, an SCP like address or a local path.
     * @param repo - The repository value to validate.
     * @throws Will throw an error if the value is not a clonable repository.
     *
     * @remarks A remote repository always carries the `.git` suffix, whichever transport it comes in:
     * it is what tells a repository apart from a page, a package or a folder. A local repository is
     * written as `file://…`, `./…` or `/…`, and its `.git` suffix is optional.
     *
     * @example
     * ```ts
     * DepUtils.repo('https://github.com/NetFeez/omega.git');
     * DepUtils.repo('./references/omega');
     * ```
     */
    export function repo(repo: unknown): asserts repo is Repo {
        if (typeof repo !== 'string') throw notClonable(repo);
        normalize(repo);
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

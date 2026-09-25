export class Validator {
    /**
     * Validates that the provided repository URL is a non-empty string and matches common Git repository URL patterns. It checks for both HTTPS and SSH formats, ensuring that the URL is well-formed and points to a valid Git repository.
     * If the validation fails, it throws an error with a descriptive message indicating the issue with the provided repository URL.
      * @param repo The repository URL to validate.
      * @throws Will throw an error if the repository URL is invalid.
     */
    static validateRepo(repo: unknown): asserts repo is Validator.Repo {
        if (typeof repo !== 'string' || !repo.trim()) throw new Error(`Invalid repository URL: "${repo}"`);
        const gitRegex = /^(?:(?:https?|git|ssh|rsync|file|git@[-\w.]+):(\/\/)?)([\w.@:/\-~]+)(\.git)(\/)?$/;
        if (!gitRegex.test(repo)) throw new Error(`Invalid repository URL: ${repo}`);
    }
}
export namespace Validator {
    export type Repo = `https://github.com/${string}/${string}.git` | `git@github.com:${string}/${string}.git`
}
export default Validator;
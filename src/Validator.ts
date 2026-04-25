export class Validator {
    static validateRepo(repo: unknown): asserts repo is Validator.Repo {
        if (typeof repo !== 'string' || !repo.trim()) throw new Error(`Invalid repository URL: "${repo}"`);
        const gitRegex = /^(?:(?:https?|git|ssh|rsync|file|git@[-\w.]+):(\/\/)?)([\w.@:/\-~]+)(\.git)(\/)?$/;
        if (!gitRegex.test(repo)) throw new Error(`Invalid repository URL: ${repo}`);
    }
    static validateName(name: unknown): asserts name is Validator.name {
        if (typeof name !== 'string' || !name.trim()) throw new Error(`Invalid dependency name: "${name}"`);
    }
}
export namespace Validator {
    export type Repo = `https://github.com/${string}/${string}.git` | `git@github.com:${string}/${string}.git`
    export type name = string;
}
export default Validator;
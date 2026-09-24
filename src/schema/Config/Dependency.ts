import Schema from '@netfeez/schema';
import Builder from './Builder.js';
import Resolver from './Resolver.js';

export const GitDependency = new Schema({
    type: 'object',
    keys: {
        name: {
            type: 'string',
            required: true,
            description: 'Unique name used to reference the dependency in flows and path aliases.'
        },
        repo: {
            type: 'string',
            required: true,
            description: 'Git repository URL to clone the dependency from.'
        },
        tag: {
            type: 'string',
            default: 'main',
            description: 'Git tag, branch or commit to check out after cloning. Defaults to "main".'
        },
        builder: {
            ...Builder.definition,
            description: 'Build pipeline applied after cloning the repository.'
        },
        resolver: {
            ...Resolver.definition,
            description: 'Target resolution used to rewrite the dependency paths.'
        }
    }
});
export type GitDependency = typeof GitDependency.infer;
export namespace GitDependency {}

export const NpmDependency = new Schema({
    type: 'object',
    keys: {
        name: {
            type: 'string',
            required: true,
            description: 'NPM package name to install.'
        },
        version: {
            type: 'string',
            required: true,
            description: 'NPM package version or semver range to install.'
        },
        builder: {
            ...Builder.definition,
            description: 'Build pipeline applied after installing the package.'
        },
        resolver: {
            ...Resolver.definition,
            description: 'Target resolution used to rewrite the dependency paths.'
        }
    }
});
export type NpmDependency = typeof NpmDependency.infer;
export namespace NpmDependency {}

export const Dependency = { GitDependency, NpmDependency };
export namespace Dependency {
    export type GitDependency = typeof GitDependency.infer;
    export type NpmDependency = typeof NpmDependency.infer;
}
export default Dependency;
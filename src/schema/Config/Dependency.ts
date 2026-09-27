/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Schema definitions for git and npm dependencies.
 * @license Apache-2.0
 */
import Schema from '@netfeez/schema';
import Builder from './Builder.js';
import Resolver from './Resolver.js';
import Defaults from '../Defaults.js';

export namespace DependencyName {

    /**
     * The identities the flow folder reserves for itself, declared once so no source can claim them.
     */
    const RESERVED = 'schema\\.json|node_modules';

    /** A single path segment: the identity of a git source, also the name of its checkout folder. */
    export const GIT: RegExp = new RegExp(`^(?!(${RESERVED})$)[A-Za-z0-9][A-Za-z0-9._-]*$`);

    /** A package name, optionally scoped: the identity of an npm source. */
    export const NPM: RegExp = new RegExp(`^(?!(${RESERVED})$)@?[A-Za-z0-9][A-Za-z0-9._~-]*(/[A-Za-z0-9][A-Za-z0-9._~-]*)?$`);

}
export namespace DependencyName {}

export const GitDependency = new Schema({
    type: 'object',
    keys: {
        name: {
            type: 'string',
            required: true,
            pattern: DependencyName.GIT,
            description: 'Unique name used to reference the dependency in flows and path aliases. It is an identity, not a path: a single alphanumeric segment.'
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
            get default() { return Defaults.array(); },
            description: 'Build pipeline applied after cloning the repository.'
        },
        resolver: {
            ...Resolver.definition,
            get default() { return Defaults.record(); },
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
            pattern: DependencyName.NPM,
            description: 'NPM package name to install, optionally scoped.'
        },
        version: {
            type: 'string',
            required: true,
            description: 'NPM package version or semver range to install.'
        },
        builder: {
            ...Builder.definition,
            get default() { return Defaults.array(); },
            description: 'Build pipeline applied after installing the package.'
        },
        resolver: {
            ...Resolver.definition,
            get default() { return Defaults.record(); },
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

import { Schema } from '@netfeez/common';
import Builder from './Builder.js';
import Resolver from './Resolver.js';

export const GitDependency = new Schema({
    type: 'object',
    properties: {
        name: { type: 'string', required: true },
        repo: { type: 'string', required: true },
        tag: { type: 'string', default: 'main' },
        builder: Builder.root,
        resolver: Resolver.root
    }
});
export type GitDependency = typeof GitDependency.infer;
export namespace GitDependency {}

export const NpmDependency = new Schema({
    type: 'object',
    properties: {
        name: { type: 'string', required: true },
        version: { type: 'string', required: true },
        builder: Builder.root,
        resolver: Resolver.root
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
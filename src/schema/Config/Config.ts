import Schema from '@netfeez/schema';
import Builder from './Builder.js';
import Resolver from './Resolver.js';
import { GitDependency, NpmDependency } from './Dependency.js';

export const Config = new Schema({
    type: 'object',
    keys: {
        $schema: {
            type: 'string',
            default: '.depflow/schema.json',
            description: 'Path to the JSON Schema describing the configuration. Used by editors and tools to provide validation, autocompletion and other features.'
        },
        flowFolder: {
            type: 'string',
            default: '.depflow',
            description: 'Folder where dependency flows are stored. Can be relative or absolute. Defaults to ".depflow".'
        },
        outDir: {
            type: 'string',
            default: 'dist',
            description: 'Output directory for built files. Can be relative or absolute. Defaults to "dist".'
        },
        tsconfig: {
            type: 'string',
            nullable: true,
            default: null,
            description: 'Path to the tsconfig.json file. Can be relative or absolute. Defaults to "tsconfig.json".'
        },
        importmap: {
            type: 'string',
            nullable: true,
            default: null,
            description: 'Path to the importmap.json file. Can be relative or absolute. Defaults to "importmap.json".'
        },
        actions: {
            type: 'object',
            additional: Builder.definition,
            default: {},
            description: 'Named build actions. Each action runs a pipeline of run, extract and transform steps.'
        },
        resolver: {
            ...Resolver.definition,
            description: 'Mapping of dependency names to their resolution targets (local file or CDN). Paths are resolved relative to this folder.'
        },
        dependencies: {
            type: 'array',
            default: [],
            items: GitDependency.definition,
            description: 'Git dependencies to clone and build. Can be a list of strings or objects.'
        },
        npmDependencies: {
            type: 'array',
            default: [],
            items: NpmDependency.definition,
            description: 'NPM dependencies to install and build. Can be a list of strings or objects.'
        }
    }
});
export type Config = typeof Config.infer;
export namespace Config {
    export type toProcess = typeof Config.inferToProcess;
}
export default Config;
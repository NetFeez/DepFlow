/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Root configuration schema: dependencies, resolver, build actions and output paths.
 * @license Apache-2.0
 */
import Schema from '@netfeez/schema';
import Builder from './Builder.js';
import PathSelection from './PathSelection.js';
import Resolver from './Resolver.js';
import Defaults from '../Defaults.js';
import { GitDependency, NpmDependency } from './Dependency.js';

export const Config = new Schema({
    type: 'object',
    keys: {
        $schema: {
            type: 'string',
            default: '.depflow/schema.json',
            description: 'Path to the JSON Schema describing the configuration. Used by editors and tools to provide validation, autocompletion and other features.'
        },
        outDir: {
            type: 'string',
            default: 'dist',
            description: 'Output directory for built files. Can be relative or absolute. Defaults to "dist".'
        },
        tsconfig: {
            ...PathSelection.definition,
            description: 'Path or list of paths to tsconfig.json files. Can be relative or absolute. When null, tsconfig synchronization is skipped unless a dependency declares its own.'
        },
        importmap: {
            ...PathSelection.definition,
            description: 'Path or list of paths to importmap.json files. Can be relative or absolute. When null, import map synchronization is skipped unless a dependency declares its own.'
        },
        actions: {
            type: 'object',
            additional: Builder.definition,
            get default() { return Defaults.record(); },
            description: 'Named build actions. Each action runs a pipeline of run, extract and transform steps.'
        },
        resolver: {
            ...Resolver.definition,
            get default() { return Defaults.record(); },
            description: 'Mapping of dependency names to their resolution targets (local file or CDN). Paths are resolved relative to this folder.'
        },
        dependencies: {
            type: 'array',
            get default() { return Defaults.array(); },
            items: GitDependency.definition,
            description: 'Git dependencies to clone and build, each an object with a name and a repo.'
        },
        npmDependencies: {
            type: 'array',
            get default() { return Defaults.array(); },
            items: NpmDependency.definition,
            description: 'NPM dependencies to install and build, each an object with a name and a version.'
        }
    }
});
export type Config = typeof Config.infer;
export namespace Config {}
export default Config;
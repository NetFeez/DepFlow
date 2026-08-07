import { Schema } from '@netfeez/common';
import Builder from './Builder.js';
import Resolver from './Resolver.js';
import { GitDependency, NpmDependency } from './Dependency.js';

export const Config = new Schema({
    type: 'object',
    properties: {
        $schema: { type: 'string', default: '.depflow/schema.json' },
        flowFolder: { type: 'string', default: '.depflow' },
        outDir: { type: 'string', default: 'dist' },
        tsconfig: { type: 'string', nullable: true, default: null },
        importmap: { type: 'string', nullable: true, default: null },
        actions: { type: 'object', allowAdditionalProperties: Builder.root, default: {} },
        resolver: Resolver.root,
        dependencies: { type: 'array', default: [], items: GitDependency.root },
        npmDependencies: { type: 'array', default: [], items: NpmDependency.root }
    }
});
export type Config = typeof Config.infer;
export namespace Config {
    export type toProcess = typeof Config.inferToProcess;
}
export default Config;
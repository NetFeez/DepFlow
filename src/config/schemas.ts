import { Schema } from '@netfeez/common';
import { version } from 'node:os';

export const ImportMap = Schema.fromObject({
    imports: { type: 'object', default: {} },
    scopes: { type: 'object', default: {} }
});

export const TsConfig = Schema.fromObject({
    compilerOptions: { type: 'object', properties: {
        baseUrl: { type: 'string' },
        rootDir: { type: 'string' },
        outDir: { type: 'string' },
        paths: { type: 'object' }
    }, allowAdditionalProperties: true }
}, true);

export const ExtractorEntry = Schema.fromObject({
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
    replacer: { union: [ { type: 'string' }, { type: 'object', properties: {
        search: { type: 'string', required: true },
        replace: { type: 'string', required: true }
    } } ], nullable: true }
});

export const BuilderEntry = Schema.fromObject({
    maxTimeMs: { type: 'number', default: 60000 },
    run: {  union: [ { type: 'string' },  { type: 'array', items: { type: 'string' } } ]  },
    extract: {  union: [ { type: 'string' }, { type: 'array', items: ExtractorEntry.root } ]  }
});

export const ResolverEntry = Schema.fromObject({
    alias: { type: 'string', required: true },
    target: { union: [
        { type: 'string' },
        { type: 'object', properties: {
            local: { type: 'string', required: true },
            type: { type: 'string' },
            cdn: { type: 'string' }
        } }
    ], required: true }
});

export const GitDependency = Schema.fromObject({
    name: { type: 'string', required: true },
    repo: { type: 'string', required: true },
    tag: { type: 'string', default: 'main' },
    builder: { type: 'array', default: [], items: BuilderEntry.root },
    resolver: { type: 'array', nullable: true, default: [], items: ResolverEntry.root }
});

export const NpmDependency = Schema.fromObject({
    name: { type: 'string', required: true },
    version: { type: 'string', required: true },
    builder: { type: 'array', default: [], items: BuilderEntry.root },
    resolver: { type: 'array', nullable: true, default: [], items: ResolverEntry.root }
});

export const Config = Schema.fromObject({
    $schema: { type: 'string', default: '.depflow/schema.json' },
    flowFolder: { type: 'string', default: '.depflow' },
    outDir: { type: 'string', default: 'dist' },
    tsconfig: { type: 'string', nullable: true, default: null },
    importmap: { type: 'string', nullable: true, default: null },
    dependencies: {  type: 'array',  default: [],  items: GitDependency.root },
    npmDependencies: { type: 'array', default: [], items: NpmDependency.root }
});

export const Schemas = {
    Config,
    TsConfig, ImportMap,
    BuilderEntry, ResolverEntry,
    GitDependency, NpmDependency
};
export namespace Schemas {
    export type Config = typeof Config;
    export type BuilderEntry = typeof BuilderEntry;
    export type ResolverEntry = typeof ResolverEntry;
    export type GitDependency = typeof GitDependency;
    export type NpmDependency = typeof NpmDependency;
    export type TsConfig = typeof TsConfig;
    export type ImportMap = typeof ImportMap;
    export type ExtractorEntry = typeof ExtractorEntry;
}

export default Schemas;

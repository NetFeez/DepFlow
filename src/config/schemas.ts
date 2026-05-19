import { Schema } from '@netfeez/common';

export const ImportMap = Schema.fromObject({
    imports: { type: 'object', allowAdditionalProperties: true, default: {} },
    scopes: { type: 'object', allowAdditionalProperties: true, default: {} }
});

export const TsConfig = Schema.fromObject({
    compilerOptions: { type: 'object', properties: {
        baseUrl: { type: 'string' },
        rootDir: { type: 'string' },
        outDir: { type: 'string' },
        paths: { type: 'object', allowAdditionalProperties: { type: 'array', items: { type: 'string' } } }
    }, allowAdditionalProperties: true }
}, true);

export const Transform = new Schema({ type: 'union', union: [
    { type: 'string' },
    { type: 'object', properties: {
        search: { type: 'string', required: true },
        flags: { type: 'string', default: 'g', pattern: /^[gimsuy]*$/ },
        replace: { type: 'string', required: true }
    } }
]});

export const GlobalTransform = new Schema({ type: 'object', required: true, properties: {
    glob: { type: 'string', required: true },
    search: { type: 'string', required: true },
    flags: { type: 'string', default: 'g', pattern: /^[gimsuy]*$/ },
    replace: { type: 'string', required: true }
}});

export const ExtractorEntry = Schema.fromObject({
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
    pathReplacer: Transform.root,
    transform: Transform.root
});

export const BuilderEntry = new Schema({ type: 'union', required: true, union: [
    { type: 'object', properties: {
        maxTimeMs: { type: 'number', default: 60000, minimum: -1 },
        allowFails: { type: 'boolean', default: false },
        run: { type: 'union', required: true, union: [ { type: 'string' },  { type: 'array', items: { type: 'string' } } ]  }
    } },
    { type: 'object', properties: {
        extract: { type: 'union', required: true, union: [ { type: 'string' }, { type: 'array', items: ExtractorEntry.root } ]  }
    } },
    { type: 'object', properties: {
        transform: GlobalTransform.root
    } }
]});

export const Builder = new Schema({ type: 'array', default: [], items: BuilderEntry.root });

export const ResolverEntry = Schema.fromObject({
    alias: { type: 'string', required: true },
    target: { type: 'union', union: [
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
    builder: Builder.root,
    resolver: { type: 'array', nullable: true, default: [], items: ResolverEntry.root }
});

export const NpmDependency = Schema.fromObject({
    name: { type: 'string', required: true },
    version: { type: 'string', required: true },
    builder: Builder.root,
    resolver: { type: 'array', nullable: true, default: [], items: ResolverEntry.root }
});

export const Config = Schema.fromObject({
    $schema: { type: 'string', default: '.depflow/schema.json' },
    flowFolder: { type: 'string', default: '.depflow' },
    outDir: { type: 'string', default: 'dist' },
    tsconfig: { type: 'string', nullable: true, default: null },
    importmap: { type: 'string', nullable: true, default: null },
    actions: { type: 'object', allowAdditionalProperties: Builder.root, default: {} },
    resolver: { type: 'array', default: [], items: ResolverEntry.root },
    dependencies: {  type: 'array',  default: [],  items: GitDependency.root },
    npmDependencies: { type: 'array', default: [], items: NpmDependency.root }
});

export const Schemas = {
    Config,
    TsConfig, ImportMap,
    Builder, BuilderEntry, ResolverEntry,
    GitDependency, NpmDependency
};
export namespace Schemas {
    export type Builder = typeof Builder;
    export type BuilderEntry = typeof BuilderEntry;
    export type Config = typeof Config;
    export type ExtractorEntry = typeof ExtractorEntry;
    export type GitDependency = typeof GitDependency;
    export type GlobalTransform = typeof GlobalTransform;
    export type ImportMap = typeof ImportMap;
    export type NpmDependency = typeof NpmDependency;
    export type ResolverEntry = typeof ResolverEntry;
    export type Transform = typeof Transform;
    export type TsConfig = typeof TsConfig;
}

export default Schemas;

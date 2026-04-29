import { Schema } from '@netfeez/common';

export const basicImportmap = Schema.fromObject({
    imports: { type: 'object' },
    scopes: { type: 'object' }
});

export const basicTsconfig = Schema.fromObject({
    compilerOptions: { type: 'object', properties: {
        baseUrl: { type: 'string' },
        rootDir: { type: 'string' },
        outDir: { type: 'string' },
        paths: { type: 'object' }
    }, allowAdditionalProperties: true },
}, true);

let test = basicTsconfig.infer

export const builder = Schema.fromObject({
    maxTimeMs: { type: 'number', default: 60000 },
    run: {  union: [ { type: 'string' },  { type: 'array', items: { type: 'string' } } ]  },
    move: {  union: [ { type: 'string' },  { type: 'object' } ]  }
});

export const pathResolverEntry = Schema.fromObject({
    alias: { type: 'string', required: true },
    target: { union: [
        { type: 'string' },
        { type: 'object', properties: {
            local: { type: 'string', required: true },
            cdn: { type: 'string' }
        } }
    ], required: true }
});

export const dependency = Schema.fromObject({
    name: { type: 'string', required: true },
    repo: { type: 'string', required: true },
    tag: { type: 'string' },
    builder: { type: 'array', default: [], items: builder.root },
    resolver: { type: 'array', nullable: true, default: [], items: pathResolverEntry.root }
});

export const npmDependencySchema = Schema.fromObject({
    name: { type: 'string', required: true },
    resolver: { type: 'array', nullable: true, default: [], items: pathResolverEntry.root }
});

export const config = Schema.fromObject({
    flowFolder: { type: 'string', default: '.depflow' },
    outDir: { type: 'string', default: '.' },
    tsconfig: { type: 'string', nullable: true, default: null },
    importmap: { type: 'string', nullable: true, default: null },
    dependencies: {  type: 'array',  default: [],  items: dependency.root },
    npmDependencies: { type: 'array', default: [], items: npmDependencySchema.root }
});

export const schemas = { basicTsconfig, config, builder, pathResolver: pathResolverEntry, dependency };
export namespace schemas {
    export type config = typeof config;
    export type builder = typeof builder;
    export type pathResolverEntry = typeof pathResolverEntry;
    export type dependency = typeof dependency;
    export type basicTsconfig = typeof basicTsconfig;
}

export default schemas;

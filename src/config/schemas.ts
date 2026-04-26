import { Schema } from '@netfeez/common';

export const basicTsconfig = new Schema({
    compilerOptions: { type: 'object', properties: {
        baseUrl: { type: 'string' },
        rootDir: { type: 'string' },
        outDir: { type: 'string' },
        paths: { type: 'object' }
    } }
});

export const builder = new Schema({
    run: {  union: [ { type: 'string' },  { type: 'array', items: { type: 'string' } } ]  },
    move: {  union: [ { type: 'string' },  { type: 'object' } ]  }
});

export const pathResolverEntry = new Schema({
    alias: { type: 'string', required: true },
    target: { union: [
        { type: 'string' },
        { type: 'object', properties: {
            local: { type: 'string', required: true },
            cdn: { type: 'string' }
        } }
    ], required: true }
});

export const dependency = new Schema({
    name: { type: 'string', required: true },
    repo: { type: 'string', required: true },
    branch: { type: 'string' },
    builder: { type: 'array', default: [], items: { type: 'object', properties: builder.schema } },
    resolver: { type: 'array', nullable: true, default: [], items: {
        type: 'object', properties: pathResolverEntry.schema}
    }
});

export const npmDependencySchema = new Schema({
    name: { type: 'string', required: true },
    resolver: { type: 'array', nullable: true, default: [], items: {
        type: 'object', properties: pathResolverEntry.schema}
    }
});

export const config = new Schema({
    flowFolder: { type: 'string', default: '.depflow' },
    outDir: { type: 'string', default: '.' },
    tsconfig: { type: 'string', nullable: true, default: null },
    importmap: { type: 'string', nullable: true, default: null },
    dependencies: {  type: 'array',  default: [],  items: { type: 'object', properties: dependency.schema }  },
    npmDependencies: { type: 'array', default: [], items: { type: 'object', properties: npmDependencySchema.schema } }
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

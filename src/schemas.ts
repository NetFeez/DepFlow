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

export const dependency = new Schema({
    name: { type: 'string', required: true },
    repo: { type: 'string', required: true },
    branch: { type: 'string' },
    builder: { type: 'array', default: [], items: { type: 'object', properties: builder.schema } }
});

export const config = new Schema({
    projectType: {  type: 'string',  enum: ['node', 'web', 'mixed'],  default: 'node'  },
    tsconfig: { type: 'string', nullable: true, default: null },
    webTsconfig: { type: 'string', nullable: true, default: null },
    paths: { type: 'object' },
    dependencies: {  type: 'array',  default: [],  items: { type: 'object', properties: dependency.schema }  }
});

export const schemas = { basicTsconfig, config, builder, dependency };
export namespace schemas {
    export type config = typeof config;
    export type builder = typeof builder;
    export type dependency = typeof dependency;
    export type basicTsconfig = typeof basicTsconfig;
}
export default schemas;

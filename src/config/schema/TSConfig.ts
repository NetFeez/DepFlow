import { Schema } from '@netfeez/common';

export const CompilerOptions = new Schema({
    type: 'object',
    allowAdditionalProperties: true,
    properties: {
        rootDir: { type: 'string' },
        outDir: { type: 'string' },
        paths: { type: 'object', allowAdditionalProperties: { type: 'array', items: { type: 'string' } } }
    }
});

export const TSConfig = new Schema({
    type: 'object',
    allowAdditionalProperties: true,
    properties: {
        compilerOptions: CompilerOptions.root
    }
});
export namespace TSConfig {
    export namespace Root {
        export type CompilerOptions = typeof CompilerOptions.infer;
    }
    export type Root = typeof TSConfig.infer;
}

export default TSConfig;
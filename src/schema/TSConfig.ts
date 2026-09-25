/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Schema definitions for tsconfig files: compiler options and path mappings.
 * @license Apache-2.0
 */
import Schema from '@netfeez/schema';

export const CompilerOptions = new Schema({
    type: 'object',
    additional: true,
    keys: {
        rootDir: {
            type: 'string',
            description: 'Root directory of the TypeScript source files.'
        },
        outDir: {
            type: 'string',
            description: 'Output directory for the compiled files.'
        },
        paths: {
            type: 'object',
            additional: { type: 'array', items: { type: 'string' } },
            description: 'Path mapping aliases used by TypeScript to resolve modules.'
        }
    },
    description: 'TypeScript compiler options.'
});

export const TSConfig = new Schema({
    type: 'object',
    additional: true,
    keys: {
        compilerOptions: {
            ...CompilerOptions.definition,
            description: 'The compiler options object of the tsconfig file.'
        }
    },
    description: 'Structure of a tsconfig.json file.'
});

export namespace TSConfig {
    export namespace Root {
        export type CompilerOptions = typeof CompilerOptions.infer;
    }
    export type Root = typeof TSConfig.infer;
}

export default TSConfig;
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Schema definitions for build steps: run, extract and transform entries.
 * @license Apache-2.0
 */
import Schema from '@netfeez/schema';
import { GlobalTransform } from './Transform.js';
import Extractor from './Extractor.js';

export const RunEntry = new Schema({
    type: 'object',
    required: true,
    keys: {
        maxTimeMs: {
            type: 'number',
            default: 60000,
            minimum: -1,
            description: 'Maximum execution time for the run step in milliseconds. A value of -1 disables the limit.'
        },
        allowFails: {
            type: 'boolean',
            default: false,
            description: 'Whether failed commands within the step are tolerated. Defaults to false.'
        },
        run: {
            type: 'union',
            required: true,
            union: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } }
            ],
            description: 'Shell command or list of shell commands to execute.'
        }
    }
});
export type RunEntry = typeof RunEntry.infer;
export namespace RunEntry {}

export const ExtractEntry = new Schema({
    type: 'object',
    required: true,
    keys: {
        extract: {
            type: 'union',
            required: true,
            union: [
                { type: 'string' },
                Extractor.definition
            ],
            description: 'Destination folder for the extracted files or an extraction mapping.'
        }
    }
});
export type ExtractEntry = typeof ExtractEntry.infer;
export namespace ExtractEntry {}

export const TransformEntry = new Schema({
    type: 'object',
    required: true,
    keys: {
        transform: {
            ...GlobalTransform.definition,
            description: 'Global transformation to apply over the files matched by the glob pattern.'
        }
    }
});
export type TransformEntry = typeof TransformEntry.infer;
export namespace TransformEntry {}

export const BuilderEntry = new Schema({
    type: 'union',
    required: true,
    union: [
        RunEntry.definition,
        ExtractEntry.definition,
        TransformEntry.definition
    ],
    description: 'A single build step: run commands, extract files or apply a global transformation.'
});
export type BuilderEntry = typeof BuilderEntry.infer;
export namespace BuilderEntry {}

export const Builder = new Schema({
    type: 'array',
    default: [],
    items: BuilderEntry.definition,
    description: 'Ordered pipeline of build steps applied when a dependency is built.'
});
export type Builder = typeof Builder.infer;
export namespace Builder {}

export default Builder;
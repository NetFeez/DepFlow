import { Schema } from '@netfeez/common';
import { GlobalTransform } from './Transform.js';
import Extractor from './Extractor.js';

export const RunEntry = new Schema({
    type: 'object',
    required: true,
    properties: {
        maxTimeMs: { type: 'number', default: 60000, minimum: -1 },
        allowFails: { type: 'boolean', default: false },
        run: { type: 'union', required: true, union: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } }
        ] }
    }
});
export type RunEntry = typeof RunEntry.infer;
export namespace RunEntry {}

export const ExtractEntry = new Schema({
    type: 'object',
    required: true,
    properties: {
        extract: { type: 'union', required: true, union: [
            { type: 'string' },
            Extractor.root
        ] }
    }
});
export type ExtractEntry = typeof ExtractEntry.infer;
export namespace ExtractEntry {}

export const TransformEntry = new Schema({
    type: 'object',
    required: true,
    properties: {
        transform: GlobalTransform.root
    }
});
export type TransformEntry = typeof TransformEntry.infer;
export namespace TransformEntry {}

export const BuilderEntry = new Schema({
    type: 'union',
    required: true,
    union: [
        RunEntry.root,
        ExtractEntry.root,
        TransformEntry.root
    ]
});
export type BuilderEntry = typeof BuilderEntry.infer;
export namespace BuilderEntry {}

export const Builder = new Schema({
    type: 'array',
    default: [],
    items: BuilderEntry.root
});
export type Builder = typeof Builder.infer;
export namespace Builder {}

export default Builder;
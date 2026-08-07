import { Schema } from '@netfeez/common';

export const TransformOptions = new Schema({
    type: 'object',
    properties: {
        search: { type: 'string', required: true },
        flags: { type: 'string', default: 'g', pattern: /^[gimsuy]*$/ },
        replace: { type: 'string', required: true }
    }
});
export type TransformOptions = typeof TransformOptions.infer;
export namespace TransformOptions {}

export const GlobalTransform = new Schema({
    type: 'object',
    required: true,
    properties: {
        glob: { type: 'string', required: true },
        ...TransformOptions.root.properties,
    }
});
export type GlobalTransform = typeof GlobalTransform.infer;
export namespace GlobalTransform {}

export const Transform = new Schema({
    type: 'union',
    required: true,
    union: [
        { type: 'string' },
        TransformOptions.root
    ]
});
export type Transform = typeof Transform.infer;
export namespace Transform {}

export default Transform;
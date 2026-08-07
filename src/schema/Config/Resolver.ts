import { Schema } from '@netfeez/common';

export const TargetOptions = new Schema({
    type: 'object',
    properties: {
        local: { type: 'string', required: true },
        type: { type: 'string' },
        cdn: { type: 'string' }
    }
});
export type TargetOptions = typeof TargetOptions.infer;
export namespace TargetOptions {}

export const Target = new Schema({
    type: 'union',
    required: true,
    union: [
        { type: 'string' },
        TargetOptions.root
    ]
});
export type Target = typeof Target.infer;
export namespace Target {}

export const Resolver = new Schema({
    type: 'object',
    required: true,
    default: {},
    allowAdditionalProperties: Target.root,
});
export type Resolver = typeof Resolver.infer;
export namespace Resolver {}

export default Resolver;
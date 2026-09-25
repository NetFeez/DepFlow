/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Schema definitions for dependency resolution targets: local, type and cdn.
 * @license Apache-2.0
 */
import Schema from '@netfeez/schema';

export const TargetOptions = new Schema({
    type: 'object',
    keys: {
        local: {
            type: 'string',
            required: true,
            description: 'Local path or glob pattern the dependency resolves to.'
        },
        type: {
            type: 'string',
            description: 'Optional identifier describing the resolution type.'
        },
        cdn: {
            type: 'string',
            description: 'CDN URL used when the dependency is resolved in CDN mode.'
        }
    }
});
export type TargetOptions = typeof TargetOptions.infer;
export namespace TargetOptions {}

export const Target = new Schema({
    type: 'union',
    required: true,
    union: [
        { type: 'string' },
        TargetOptions.definition
    ],
    description: 'Resolution target of a dependency: either a plain string or an object with local, type and cdn options.'
});
export type Target = typeof Target.infer;
export namespace Target {}

export const Resolver = new Schema({
    type: 'object',
    required: true,
    default: {},
    additional: Target.definition,
    description: 'Mapping of dependency names to their resolution targets (local file or CDN).'
});
export type Resolver = typeof Resolver.infer;
export namespace Resolver {}

export default Resolver;
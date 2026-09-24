import Schema from '@netfeez/schema';

export const TransformOptions = new Schema({
    type: 'object',
    keys: {
        search: {
            type: 'string',
            required: true,
            description: 'The regular expression pattern to search for in the file content.'
        },
        flags: {
            type: 'string',
            default: 'g',
            pattern: /^[gimsuy]*$/,
            description: 'Flags applied to the regular expression search. Defaults to "g" (global).'
        },
        replace: {
            type: 'string',
            required: true,
            description: 'The replacement string used to substitute the matches found by the search pattern.'
        }
    }
});
export type TransformOptions = typeof TransformOptions.infer;
export namespace TransformOptions {}

export const GlobalTransform = new Schema({
    type: 'object',
    required: true,
    keys: {
        glob: {
            type: 'string',
            required: true,
            description: 'Glob pattern matching the files to which the global transformation is applied.'
        },
        ...TransformOptions.definition.keys
    },
    description: 'Global transformation applied to all files matching a glob pattern.'
});
export type GlobalTransform = typeof GlobalTransform.infer;
export namespace GlobalTransform {}

export const Transform = new Schema({
    type: 'union',
    required: true,
    union: [
        { type: 'string' },
        TransformOptions.definition
    ],
    description: 'A transformation definition: either a plain string used as a regex pattern or an object with search, flags and replace options.'
});
export type Transform = typeof Transform.infer;
export namespace Transform {}

export default Transform;
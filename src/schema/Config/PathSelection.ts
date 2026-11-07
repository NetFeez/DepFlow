/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Schema for a synchronization target declared as one path or a list of paths.
 * @license Apache-2.0
 */
import Schema from '@netfeez/schema';

export const PathSelection = new Schema({
    type: 'union',
    nullable: true,
    default: null,
    union: [
        { type: 'string' },
        {
            type: 'array',
            items: { type: 'string' }
        }
    ],
    description: 'A single path or a list of paths. When null, no path is declared.'
});

export namespace PathSelection {
    export type Value = typeof PathSelection.infer;
}

export default PathSelection;

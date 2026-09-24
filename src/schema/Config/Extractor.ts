import Schema from '@netfeez/schema';
import Transform from './Transform.js';

export const ExtractorEntry = new Schema({
    type: 'object',
    required: true,
    keys: {
        to: {
            type: 'string',
            required: true,
            description: 'Destination folder to which the matched files are copied.'
        },
        map: {
            ...Transform.definition,
            required: false,
            description: 'Transformation applied to the destination path of the extracted files.'
        },
        transform: {
            ...Transform.definition,
            required: false,
            description: 'Transformation applied to the content of the extracted files.'
        }
    }
});
export type ExtractorEntry = typeof ExtractorEntry.infer;
export namespace ExtractorEntry {}

export const Extractor = new Schema({
    type: 'object',
    required: true,
    additional: {
        type: 'union',
        required: true,
        union: [
            { type: 'string', required: true },
            ExtractorEntry.definition
        ]
    },
    description: 'Mapping of source glob patterns to extraction entries, each describing where and how files are extracted.'
});
export type Extractor = typeof Extractor.infer;
export namespace Extractor {}
export default Extractor;
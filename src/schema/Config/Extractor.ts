import { Schema } from '@netfeez/common';
import Transform from './Transform.js';

export const ExtractorEntry = new Schema({
    type: 'object',
    required: true,
    properties: {
        to: { type: 'string', required: true },
        map: { ...Transform.root, required: false },
        transform: { ...Transform.root, required: false }
    }
});
export type ExtractorEntry = typeof ExtractorEntry.infer;
export namespace ExtractorEntry {}

export const Extractor = new Schema({
    type: 'object',
    required: true,
    allowAdditionalProperties: {
        type: 'union',
        required: true,
        union: [
            { type: 'string', required: true },
            ExtractorEntry.root
        ]
    }
});
export type Extractor = typeof Extractor.infer;
export namespace Extractor {}
export default Extractor;
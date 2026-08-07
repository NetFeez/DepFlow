import { Schema } from '@netfeez/common';

export const ImportMap = new Schema({
    type: 'object',
    allowAdditionalProperties: true,
    default: {},
    properties: {
        imports: { type: 'object', allowAdditionalProperties: true, default: {} },
        scopes: { type: 'object', allowAdditionalProperties: true, default: {} }
    }
});

export namespace ImportMap {
    export type Root = typeof ImportMap.infer;
}

export default ImportMap;
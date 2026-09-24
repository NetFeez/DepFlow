import Schema from '@netfeez/schema';

export const ImportMap = new Schema({
    type: 'object',
    additional: true,
    default: {},
    keys: {
        imports: {
            type: 'object',
            additional: true,
            default: {},
            description: 'Mapping of bare specifiers to their resolved URLs or paths.'
        },
        scopes: {
            type: 'object',
            additional: true,
            default: {},
            description: 'Scope-based mappings of bare specifiers to their resolved URLs or paths.'
        }
    },
    description: 'Structure of an import map file.'
});

export namespace ImportMap {
    export type Root = typeof ImportMap.infer;
}

export default ImportMap;
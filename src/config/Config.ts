/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Depflow main configuration store, persisted as JSON or YAML with generated comments.
 * @license Apache-2.0
 */

import { Path } from '@netfeez/common-node';
import type { Document } from '@netfeez/yaml';

import schema from '../schema/schema.js';
import Settings from './Settings.js';
import JsonSchema from './JsonSchema.js';
import JsonCodec from './codecs/JsonCodec.js';
import YamlCodec from './codecs/YamlCodec.js';

export class Config extends Settings<typeof schema.Config, Document> {
    protected static schema = schema.Config;

    /**
     * The formats of the config file, in resolution order.
     *
     * The YAML one carries the header of a generated file; the comments of each key come from the
     * descriptions of the schema, on their own.
     * @returns The JSON codec and the YAML codec of the config.
     */
    protected static override get codecs(): readonly Settings.AnyCodec[] {
        return [
            new JsonCodec(),
            new YamlCodec(schema.Config, {
                header: [
                    '# Depflow Configuration File',
                    '# You can use the Red Hat extension for JSON schema validation in VSCode: "$schema: .depflow/schema.json"',
                    '', ''
                ]
            })
        ];
    }

    /**
     * Saves the config and refreshes the editor JSON Schema under the project `.depflow` directory.
     * @param path - The path to save the config file to.
     * @returns A promise that resolves when the config and the editor schema have been written.
     **/
    public override async save(path: string = this.path!): Promise<void> {
        const dir = Path.dirname(path);
        await super.save(path);
        await JsonSchema.write(dir);
    }
}

export namespace Config {}

export default Config;

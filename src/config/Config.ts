/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Depflow main configuration store, persisted as JSON or YAML with generated comments.
 * @license Apache-2.0
 */
import { Document } from '@netfeez/yaml';
import { Path } from '@netfeez/common-node';

import schema from '../schema/schema.js';
import Settings from './Settings.js';
import JsonSchema from './JsonSchema.js';

export class Config extends Settings<typeof schema.Config> {
    protected static schema = schema.Config;

    /**
     * Decorates a freshly-created YAML document with the file header and field comments.
     * @param document - The YAML document to decorate.
     */
    protected static comments(document: Document): void {
        document.header.push(
            '# Depflow Configuration File',
            '# You can use the Red Hat extension for JSON schema validation in VSCode: "$schema: .depflow/schema.json"',
            '', ''
        );
        Settings.applyComments(document, Settings.commentsFromSchema(schema.Config));
    }

    /**
     * Saves the config and refreshes the editor JSON Schema under the project `.depflow` directory.
     * @param path - The path to save the config file to.
     * @returns A promise that resolves when the config and the editor schema have been written.
     **/
    public override async save(path: string = this.vPath!): Promise<void> {
        const dir = Path.dirname(path);
        await super.save(path);
        await JsonSchema.write(dir);
    }
}

export namespace Config {}

export default Config;

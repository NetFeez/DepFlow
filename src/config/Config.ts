/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Depflow main configuration store, persisted as JSON or YAML with generated comments.
 * @license Apache-2.0
 */
import { Document } from '@netfeez/yaml';

import schema from '../schema/schema.js';
import Settings from './Settings.js';

export class Config extends Settings<typeof schema.Config> {
    protected static schema = schema.Config;

    /**
     * Decorates a freshly-created YAML document with the file header and field comments.
     * @param document - The YAML document to decorate.
     */
    protected static comments(document: Document): void {
        document.header.push(
            '# Depflow Configuration File',
            '# You can use Red Hat extension to use YAML schema validation in VSCode: "$schema: .depflow/schema/config.schema.json"'
        );
        Settings.applyComments(document, Settings.commentsFromSchema(schema.Config));
    }
}

export default Config;
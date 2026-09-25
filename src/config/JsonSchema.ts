/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Keeps the editor JSON Schema of the depflow configuration in sync under the project flow directory.
 * @license Apache-2.0
 */
import { File, Path } from '@netfeez/common-node';

import schema from '../schema/schema.js';

export namespace JsonSchema {
    /**
     * Writes the configuration JSON Schema to `<projectRoot>/.depflow/schema.json`.
     * Editors and tools use the file to validate and autocomplete the config.
     * Effectively replaces the pre-dispatch write that used to run on every CLI
     * invocation with a write anchored to the project that owns the config.
     * @param projectRoot - Absolute path of the directory containing the config file.
     * @returns A promise that resolves when the schema file has been written.
     **/
    export async function write(projectRoot: string): Promise<void> {
        const path = Path.join(projectRoot, '.depflow', 'schema.json');
        await File.ensureDir(Path.dirname(path));
        await File.write(path, JSON.stringify(schema.Config.jsonSchema));
    }
}

export default JsonSchema;
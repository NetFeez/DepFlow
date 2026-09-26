/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Reads and writes a config file as plain JSON.
 * @license Apache-2.0
 */

import type { JsonValue } from '@netfeez/yaml';

import type Settings from '../Settings.js';

/**
 * Reads and writes a config file as plain JSON.
 *
 * JSON preserves nothing around the values, so it has no document of its own: the data is the
 * document, and every save regenerates the file from it.
 */
export class JsonCodec implements Settings.Codec<null, JsonValue> {
    /** The file extensions this codec is selected by. */
    public readonly extensions: readonly string[] = [ '.json' ];

    /**
     * Parses the JSON text into the data it holds.
     * @param text - The JSON text of the file.
     * @returns The data and the document of the file, or `null` when the text holds no document.
     * @throws { SyntaxError } When the text is not valid JSON.
     */
    public decode(text: string): Settings.Decoded<null> | null {
        const data = JSON.parse(text);
        return data === null ? null : { data, document: null };
    }

    /** JSON has no document to create: the data is the document. **/
    public create(): null { return null; }

    /** Renders the data as indented JSON. **/
    public encode(data: JsonValue, document: null): string { return JSON.stringify(data, null, 4); }
}

export namespace JsonCodec { }

export default JsonCodec;

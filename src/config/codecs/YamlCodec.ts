/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Reads and writes a config file as YAML, preserving the formatting of the file it was read from.
 * @license Apache-2.0
 */

import Schema, { Definition } from '@netfeez/schema';
import Yaml, { type Document, type JsonValue } from '@netfeez/yaml';

import type Settings from '../Settings.js';


/**
 * Reads and writes a config file as YAML, preserving the formatting of the file it was read from.
 *
 * The document is the YAML tree: the values it holds, plus everything YAML keeps around them (key
 * order, indentation, comments). A document created from scratch is decorated with the file header
 * and with the description the schema declares for each key, so a generated config documents itself.
 */
export class YamlCodec implements Settings.Codec<Document, JsonValue> {
    /** The file extensions this codec is selected by. */
    public readonly extensions: readonly string[] = [ '.yaml', '.yml' ];

    protected schema: Schema<Definition.Definition>;
    protected header: string[];

    /**
     * Creates the codec.
     * @param schema - The schema whose key descriptions document a generated file.
     * @param options - Options for the codec.
     */
    public constructor(schema: Schema<Definition.Definition>, options: YamlCodec.Options = {}) {
        this.schema = schema;
        this.header = options.header ?? [];
    }

    /**
     * Parses the YAML text into the document it describes.
     * @param text - The YAML text of the file.
     * @returns The data and the document of the file, or `null` when the text holds no document.
     * @throws { YamlError } When the text is not valid YAML.
     *
     * @remarks A file holding only comments, or nothing at all, parses into an empty tree: it has
     * no data, so there is nothing to load and the defaults of the schema take over.
     */
    public decode(text: string): Settings.Decoded<Document> | null {
        const document = Yaml.parse(text);
        const data = document.toJS();
        return data === null ? null : { data, document };
    }

    /**
     * Creates a document holding the data, with the file header and the schema descriptions.
     * @param data - The data to hold in the new document.
     * @returns The new document.
     */
    public create(data: JsonValue): Document {
        const document = Yaml.create(data);
        this.decorate(document);
        return document;
    }

    /**
     * Synchronizes the data into the document and renders it, leaving everything the data does not
     * touch (key order, indentation, and the comments of the keys it leaves alone) as it was.
     * @param data - The data to render.
     * @param document - The document the data is rendered through.
     * @returns The YAML text of the document.
     */
    public encode(data: JsonValue, document: Document): string {
        document.sync(data);
        return document.dump();
    }

    /** Writes the file header and the schema description of every key the document has. **/
    private decorate(document: Document): void {
        if (this.header.length) document.header.push(...this.header);
        for (const [key, description] of Object.entries(this.descriptions())) {
            const node = document.get(key);
            if (!node) continue;
            node.meta.lead = description.map(line => line.startsWith('#') ? line : `# ${line}`);
        }
    }

    /** The description of every declared top-level key, as the comment lines of a generated file. **/
    private descriptions(): Record<string, string[]> {
        const definition = this.schema.definition;
        if (definition.type !== 'object' || !definition.keys) return {};
        const descriptions: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(definition.keys)) {
            if (!value.description) continue;
            descriptions[key] = value.description.split('\n').map(line => line.trim());
        }
        return descriptions;
    }
}

export namespace YamlCodec {
    export interface Options {
        /** The raw lines written at the top of a generated file, pushed verbatim. */
        header?: string[];
    }
}

export default YamlCodec;

/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Abstract schema-backed config store with flattened property access, whose file format lives in a codec that owns the document it preserves.
 * @license Apache-2.0
 */

import { File, Path } from '@netfeez/common-node';
import { Flatten } from '@netfeez/common';
import Schema, { Definition } from '@netfeez/schema';


export abstract class Settings<S extends Schema<Definition.Object>, TDocument = never> {
    /** The schema describing and validating the config. */
    protected static schema: Schema<any>;

    /**
     * The formats this config can be persisted in, in resolution order.
     *
     * Declaring the formats is what replaces the implicit "every config is JSON and YAML": a class
     * that only needs JSON declares only the JSON codec and never reaches a YAML parser.
     * @returns The codecs of the class, empty when it declares no format at all.
     *
     * @remarks The types are widened because a static cannot see the type parameters of its class.
     * {@link Settings.codec} is the narrowing seam, named {@link Settings.AnyCodec} on purpose.
     */
    protected static get codecs(): readonly Settings.AnyCodec[] { return []; }

    protected vData: Settings.Data<S>;
    protected props: Flatten.Document;
    protected document: TDocument | null;
    protected path: string | null;

    /** The formats of the class this instance was built from, the only way it reaches them. **/
    protected formats: Settings.Formats;

    /**
     * Creates the config store.
     * @param data - The processed data to store.
     * @param options - Additional options for the config store.
     */
    public constructor(data: Settings.Data<S>, options: Settings.Options<TDocument> = {}) {
        this.formats = new.target;
        this.vData = data;
        this.props = Flatten.object(this.vData);
        this.document = options.document ?? null;
        this.path = options.path ?? null;
    }

    public get data(): Settings.Data<S> { return this.vData; }
    public set data(value: Settings.Data<S>) {
        this.vData = value;
        this.props = Flatten.object(this.vData);
    }

    /**
     * Gets a config property by its path.
     * @param path - The path to the config property.
     * @returns The value of the config property at the specified path.
     */
    public get<TKey extends keyof Settings.Props<S>>(path: TKey): Settings.Props<S>[TKey] {
        return this.props[path];
    }
    public set<TKey extends keyof Settings.Props<S>>(path: TKey, value: Settings.Props<S>[TKey]): void {
        this.props[path] = value;
        this.vData = Flatten.unObject(this.props);
    }
    public merge(partial: Settings.DeepPartial<Settings.Data<S>>): void {
        this.vData = Settings.deepMerge(this.vData, partial);
        this.props = Flatten.object(this.vData);
    }

    /**
     * Saves the config to the given path, in the format of its extension.
     *
     * The document the config was loaded with is handed to the codec, so untouched keys, comments
     * and formatting survive the round trip. When the config is saved into another format than it
     * was loaded from (`json-to-yaml`), there is no document of that format yet, so the codec
     * creates one from the data and the file is written as if it had always been in that format.
     * @param path - The path to save the config file to, defaulting to the path it was loaded from.
     * @returns A promise that resolves when the config is saved.
     * @throws { Error} When no path is given, or the class declares no format for the extension.
     */
    public async save(path: string = this.path!): Promise<void> {
        if (!path) throw new Error('No path specified for saving the config.');
        const codec = Settings.require(this.formats, path);
        await File.ensureDir(Path.dirname(path));
        await File.write(path, codec.encode(this.vData, this.document ?? codec.create(this.vData)), 'utf-8');
    }

    /**
     * Loads a config from the given path, creating it with defaults when missing.
     *
     * The file is read as plain text and nothing more: the codec of the extension decides what that
     * text means and hands back both the data and the document the format preserves. A file holding
     * no document at all (missing, blank, or holding nothing but comments) decodes to nothing, and
     * the config is then built from the defaults the schema resolves, seeded into a fresh document.
     * @param this - The concrete Settings subclass constructor.
     * @param path - The path to the config file.
     * @param options - Options for loading the config.
     * @returns A promise that resolves with the loaded config.
     * @throws { Error} When the class declares no format for the extension of the path.
     */
    public static async load<C extends Settings<any, any>>(this: Settings.Ctor<C>, path: string, options: Settings.LoadOptions = {}): Promise<C> {
        const logger = options.logger;
        const codec = Settings.require(this, path);
        if (logger) logger.log(`loading config from &C6[${path}]`);

        const text = await File.exists(path) ? await File.read(path, 'utf-8') : null;
        if (text === null && logger) logger.log(`config file &C6[${path}]&R does not exist, creating it`);

        try {
            const source = text === null ? null : codec.decode(text);
            const data = this.parse(source === null ? {} : source.data);
            const config = new this(data, { document: source?.document ?? codec.create(data), path });
            if (text === null) {
                if (options.create) await config.save();
                if (logger) logger.log(`config file &C6[${path}]&R &C2was created successfully`);
            }
            return config;
        } catch (error) {
            if (logger) logger.error(`config file &C6[${path}]&R &C1could not be loaded`);
            throw error;
        }
    }

    /**
     * Validates the data of a file against the schema, filling in the defaults of whatever is
     * absent, so that a partial file yields a complete config.
     * @param data - The data read from the file.
     * @returns The data of the config, ready to be stored.
     *
     * @remarks The return type is widened because a static cannot see the type parameters of its
     * class. {@link Settings.Ctor} is where a caller of {@link load} gets it back, as the data of
     * the subclass it asked for.
     */
    public static parse(data: unknown): Settings.Data<any> { return this.schema.processUnknown(data); }

    /**
     * The codec this class declares for a file extension.
     * @param extension - The lower-cased file extension, including the leading dot.
     * @returns The codec that reads and writes that extension, or `null` when the class declares no
     * format for it.
     *
     * @remarks The types are widened because a static cannot see the type parameters of its class,
     * as in {@link codecs}.
     */
    public static codec(extension: string): Settings.AnyCodec | null {
        return this.codecs.find(candidate => candidate.extensions.includes(extension)) ?? null;
    }

    /**
     * The codec of a path, as declared by the class it is asked for.
     * @param formats - The formats of the class, either its static side or a loaded config.
     * @param path - The path the config is read from or written to.
     * @returns The codec of the extension of the path.
     * @throws { Error } When no format is declared for that extension.
     */
    private static require(formats: Settings.Formats, path: string): Settings.AnyCodec {
        const extension = Settings.extension(path);
        const codec = formats.codec(extension);
        if (!codec) throw new Error(`Unsupported config file extension: ${extension}`);
        return codec;
    }

    /**
     * The lower-cased extension of a path, the form formats are selected by.
     * @param path - The path to get the extension of.
     * @returns The lower-cased extension of the path, including the leading dot.
     */
    private static extension(path: string): string { return Path.extName(path).toLowerCase(); }

    /**
     * Checks if a value is a non-null object (not an array).
     * @param value - The value to check.
     * @returns `true` if the value is a non-null object, `false` otherwise.
     */
    private static isObject(value: any): value is Record<string, any> {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * Merges two objects deeply, recursively merging their properties.
     * @param target - The object to merge into.
     * @param source - The object to merge from.
     * @returns The merged object.
     */
    private static deepMerge(target: any, source: any): any {
        if (!Settings.isObject(target) || !Settings.isObject(source)) return source;
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] === undefined) continue;
            if (Settings.isObject(result[key]) && Settings.isObject(source[key]))
                result[key] = Settings.deepMerge(result[key], source[key]);
            else result[key] = source[key];
        }
        return result;
    }
}

export namespace Settings {
    export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
    export type Data<S extends Schema<any>> = S['infer'];
    export type Props<S extends Schema<any>> = Flatten.Object<Extract<S['infer'], Flatten.Document>>;

    export interface Options<TDocument = never> {
        /** The document the format of the file preserves, carried across loads and saves. */
        document?: TDocument | null;
        path?: string | null;
    }
    export interface LoadOptions {
        logger?: Logger;
        create?: boolean;
    }
    export interface Logger {
        log(...args: any[]): void;
        warn?(...args: any[]): void;
        error(...args: any[]): void;
    }

    /**
     * A codec with both of its types widened, which is what a static can name: the statics of a
     * class cannot see the type parameters of that class, so this is the shape a codec is looked up
     * and carried in, and the only widening in the design.
     */
    export type AnyCodec = Settings.Codec<any, any>;

    /**
     * The formats of a class, as far as a caller needs them: the codec of an extension, or `null`
     * when the class declares no format for it.
     *
     * This is what a config keeps of its own class (its formats) and what a static side exposes
     * ({@link Settings.Ctor}), so both resolve a format the same way.
     */
    export interface Formats {
        codec(extension: string): Settings.AnyCodec | null;
    }

    /**
     * What a concrete subclass must expose for {@link load} to build it: its constructor, the
     * schema behind {@link parse}, and the formats it declares.
     */
    export interface Ctor<C extends Settings<any, any>> extends Settings.Formats {
        new (data: any, options?: Settings.Options<any>): C;
        parse(data: unknown): Settings.Data<any>;
    }

    /**
     * A bidirectional text format: it reads the text of a config file, writes it back, and carries
     * the document of that file — whatever the format keeps around the values — from one to the other.
     *
     * @typeParam TDocument - The document the format preserves; `null` for a format that keeps
     * nothing beyond the data, whose document is the data itself.
     * @typeParam TData - The data the format renders.
     */
    export interface Codec<TDocument, TData> {
        /** The lower-cased file extensions this codec is selected by, including the leading dot. */
        readonly extensions: readonly string[];
        /**
         * Parses the text of a file into the data it holds and the document that holds it.
         * @param text - The text of the file.
         * @returns The data and the document, or `null` when the text holds no document at all.
         */
        decode(text: string): Settings.Decoded<TDocument> | null;
        /**
         * Creates the document of a file that does not exist yet, holding the given data.
         * @param data - The data to hold in the new document.
         * @returns The new document.
         */
        create(data: TData): TDocument;
        /**
         * Renders the data through the document, keeping whatever the format preserves.
         * @param data - The data to render.
         * @param document - The document the data is rendered through.
         * @returns The text of the file.
         */
        encode(data: TData, document: TDocument): string;
    }

    export interface Decoded<TDocument> {
        /** The data the file holds, before the schema validates it. */
        data: unknown;
        /** The document the file is written through, and written back from. */
        document: TDocument;
    }
}

export default Settings;

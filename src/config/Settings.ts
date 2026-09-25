/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Abstract schema-backed config store with flattened property access and file persistence (JSON and YAML).
 * @license Apache-2.0
 */

import { File, Path } from '@netfeez/common-node';
import { Flatten } from '@netfeez/common';
import Schema, { Definition } from '@netfeez/schema';
import Yaml, { Document } from '@netfeez/yaml';


export abstract class Settings<S extends Schema<Definition.Object>> {
    protected vData: Settings.Data<S>;
    protected vProps: Flatten.Document;
    protected vYaml: Document | null;
    protected vPath: string | null;

    /**
     * The schema describing and validating the config.
     */
    protected static schema: Schema<any>;

    /**
     * Creates the config store.
     * @param data - The processed data to store.
     * @param options - Additional options for the config store.
     */
    public constructor(data: Settings.Data<S>, options: Settings.Options = {}) {
        this.vData = data;
        this.vProps = Flatten.object(this.vData);
        this.vYaml = options.yaml ?? null;
        this.vPath = options.path ?? null;
    }

    public get data(): Settings.Data<S> { return this.vData; }
    public set data(value: Settings.Data<S>) {
        this.vData = value;
        this.vProps = Flatten.object(this.vData);
    }

    /**
     * Gets a config property by its path.
     * @param path - The path to the config property.
     * @returns The value of the config property at the specified path.
     */
    public get<T extends keyof Settings.Props<S>>(path: T): Settings.Props<S>[T] {
        return this.vProps[path];
    }
    public set<T extends keyof Settings.Props<S>>(path: T, value: Settings.Props<S>[T]): void {
        this.vProps[path] = value;
        this.vData = Flatten.unObject(this.vProps);
    }
    public merge(partial: Settings.DeepPartial<Settings.Data<S>>): void {
        this.vData = Settings.deepMerge(this.vData, partial);
        this.vProps = Flatten.object(this.vData);
    }

    /** Converts the config to a JSON string. */
    public toJson(): string { return JSON.stringify(this.vData, null, 4); }

    /**
     * Converts the config to a YAML string, preserving untouched formatting and comments.
     * @returns The YAML text representation of the config.
     */
    public toYaml(): string {
        if (!this.vYaml) {
            this.vYaml = Yaml.create(<never>this.vData);
            (this.constructor as unknown as typeof Settings).comments(this.vYaml);
        }
        this.vYaml.sync(<never>this.vData);
        return this.vYaml.dump();
    }

    /**
     * Saves the config to the configured path.
     * @param path - The path to save the config file to.
     * @returns A promise that resolves when the config is saved.
     */
    public save(path: string = this.vPath!): Promise<void> {
        if (!path) throw new Error('No path specified for saving the config.');
        return Settings.save(path, this);
    }

    /**
     * Saves the given config to the given path.
     * @param path - The path to save the config file to.
     * @param config - The config to save.
     * @returns A promise that resolves when the config is saved.
     */
    public static async save(path: string, config: Settings<any>): Promise<void> {
        const ext = Path.extName(path).toLowerCase();
        const dir = Path.dirname(path);
        await File.ensureDir(dir);
        switch (ext) {
            case '.yaml':
            case '.yml':  await File.write(path, config.toYaml(), 'utf-8'); return;
            case '.json': await File.write(path, config.toJson(), 'utf-8'); return;
            default: throw new Error(`Unsupported config file extension: ${ext}`);
        }
    }


    /**
     * Loads a config from the given path, creating it with defaults when missing.
     * @param this - The concrete Settings subclass constructor.
     * @param path - The path to the config file.
     * @param options - Options for loading the config.
     * @returns A promise that resolves with the loaded config.
     */
    public static async load<C extends Settings<any>>(this: Settings.Ctor<C>, path: string, options: Settings.LoadOptions = {}): Promise<C> {
        const self = this as unknown as typeof Settings;
        const logger = options.logger;
        const ext = Path.extName(path).toLowerCase();
        if (!['.yaml', '.yml', '.json'].includes(ext)) throw new Error(`Unsupported config file extension: ${ext}`);
        if (logger) logger.log(`loading config from &C6[${path}]`);

        if (!await File.exists(path)) {
            if (logger) logger.log(`config file &C6[${path}]&R does not exist, creating it`);
            const data = self.schema.process({});
            let yaml: Document | null = null;
            if (ext === '.yaml' || ext === '.yml') {
                yaml = Yaml.create(<never>data);
                self.comments(yaml);
            }
            const config = new this(data, { yaml, path });
            if (options.create) await Settings.save(path, config);
            if (logger) logger.log(`config file &C6[${path}]&R &C2was created successfully`);
            return config;
        }

        try {
            const content = await File.read(path, 'utf-8');
            switch (ext) {
                case '.yaml':
                case '.yml': {
                    let data = self.schema.process({});
                    let yaml: Document;
                    if (!content.trim()) {
                        yaml = Yaml.create(<never>data);
                        self.comments(yaml);
                    } else {
                        yaml = Yaml.parse(content);
                        data = self.schema.processUnknown(yaml.toJS());
                    }
                    return new this(data, { yaml, path });
                }
                case '.json': {
                    const data = self.schema.processUnknown(JSON.parse(content));
                    return new this(data, { path });
                }
                default: throw new Error(`Unsupported config file extension: ${ext}`);
            }
        } catch (error) {
            if (logger) logger.error(`config file &C6[${path}]&R &C1could not be loaded`);
            throw error;
        }
    }

    /**
     * Hook to decorate a freshly-created YAML document with comments and header lines.
     * Override in subclasses to enrich generated config files.
     * @param document - The YAML document to decorate.
     */
    protected static comments(document: Document): void {}

    protected static applyComments(document: Document, comments: Settings.Comments): void {
        for (const [key, comment] of Object.entries(comments)) {
            const node = document.get(key);
            if (!node) continue;
            const object = typeof comment === 'string' || Array.isArray(comment) ? { lead: comment } : comment;
            if (object.lead) {
                const lead = (Array.isArray(object.lead) ? object.lead : [object.lead]);
                node.meta.lead = lead.map(line => line.startsWith('#') ? line : `# ${line}`);
            }
            if (object.inline) node.meta.inline = object.inline.startsWith('#') ? object.inline : `# ${object.inline}`;
        }
    }

    /**
     * Builds YAML comments from the descriptions of an object schema definition.
     * Each description becomes the lead comment of its corresponding top-level key.
     * @param schema - The schema instance whose definition descriptions are used.
     * @returns The comments mapping ready to be applied with {@link applyComments}.
     */
    protected static commentsFromSchema(schema: Schema): Settings.Comments {
        const definition = schema.definition as Partial<Definition.Object>;
        if (definition.type !== 'object' || !definition.keys) return {};
        const comments: Settings.Comments = {};
        for (const [key, value] of Object.entries(definition.keys)) {
            const description = (value as { description?: string }).description;
            if (!description) continue;
            comments[key] = description.split('\n').map(line => line.trim());
        }
        return comments;
    }

    private static isObject(value: any): value is Record<string, any> {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
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
    export type ToProcess<S extends Schema<any>> = S['inferToProcess'];
    export type Data<S extends Schema<any>> = S['infer'];
    export type Props<S extends Schema<any>> = Flatten.Object<Extract<S['infer'], Flatten.Document>>;

    export interface Options {
        yaml?: Document | null;
        path?: string | null;
    }
    export interface LoadOptions extends Options {
        logger?: Logger;
        create?: boolean;
    }
    export interface Logger {
        log(...args: any[]): void;
        warn?(...args: any[]): void;
        error(...args: any[]): void;
    }

    export interface Ctor<C extends Settings<any>> {
        new (data: any, options?: Settings.Options): C;
    }

    export namespace Comments {
        export interface Object {
            lead?: string | string[];
            inline?: string;
        }
        export type Entry = string | string[] | Object;
    }
    export interface Comments {
        [key: string]: Comments.Entry;
    }
}

export default Settings;
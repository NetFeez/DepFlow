/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Updates and persists the import map file from compiled path aliases.
 * @license Apache-2.0
 */

import { Logger } from '@netfeez/vterm';
import { Path } from '@netfeez/common-node';

import schema from '../schema/schema.js';
import Settings from './Settings.js';
import JsonCodec from './codecs/JsonCodec.js';

import type AliasCompiler from '../resolve/AliasCompiler.js';

export class ImportMap extends Settings<typeof schema.ImportMap> {
    protected static schema = schema.ImportMap;
    protected logger: Logger;

    constructor(data: ImportMap.Data, options: ImportMap.Options = {}) {
        super(data, options);
        this.logger = options.logger || new Logger({ name: 'IMP-MAP' });
    }

    /**
     * The formats of the import map file: JSON only, so it never reaches a YAML parser.
     * @returns The JSON codec of the file.
     */
    protected static override get codecs(): readonly Settings.AnyCodec[] { return [ new JsonCodec() ]; }

    /**
     * Updates the import map data based on the provided compiled aliases.
     * It constructs an "imports" section where each alias is mapped to its target path.
     * @param aliases - An array of compiled aliases.
     * @param mode - The resolution mode ('local' or 'cdn').
     */
    public updateImports(aliases: AliasCompiler.CompiledAlias[], mode: 'local' | 'cdn'): void {
        if (!this.data.imports) this.data.imports = {};

        const projectRoot = Path.dirname(this.path!);

        for (const aliasObj of aliases) {
            const key = aliasObj.isWildcard ? `${aliasObj.alias}/` : aliasObj.alias;

            let target = mode === 'cdn' && aliasObj.targets.cdn
                ? aliasObj.targets.cdn
                : aliasObj.targets.local;

            if (target === aliasObj.targets.local) {
                target = Path.diff(projectRoot, target);
                target = target.startsWith('.') ? target : `./${target}`;
                target = Path.normalize(target);
            }
            if (aliasObj.isWildcard) {
                if (!target.endsWith('/')) target += '/';
            }

            this.data.imports[key] = target;
        }
    }
    /**
     * Saves the current import map data to a file.
     * It ensures that the directory for the file exists, converts the data to a JSON string with proper formatting, and writes it to the file system using the File.write method.
     * The method also includes logging to inform users when the save operation is successful.
     * @param path - The path to the import map file to save.
     * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
     */
    public async save(path: string = this.path!): Promise<void> {
        await super.save(path);
        if (path !== this.path) this.path = path;
        const filename = Path.fileName(path);
        this.logger.log(`&C2Saved file &C4${filename}`);
    }
}

export namespace ImportMap {
    export type Data = schema.ImportMap.Root;
    export interface Options extends Settings.Options {
        logger?: Logger;
    }
}

export default ImportMap;
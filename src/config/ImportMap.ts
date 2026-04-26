import path from 'node:path';
import { Logger, Utilities } from 'vortez';

import File from "../support/File.js";
import AliasCompiler from '../support/PathResolver/AliasCompiler.js';
import { isWritable } from 'node:stream';

export class ImportMap {
    protected logger: Logger;

    constructor(
        protected data: ImportMap.Data,
        protected projectRoot: string,
        protected filename: string,
        options: ImportMap.Options = {}
    ) { 
        this.logger = options.logger || new Logger({ prefix: 'IMP-MAP' }); 
    }

    /**
     * Updates the import map data based on the provided compiled aliases.
     * It constructs an "imports" section where each alias is mapped to its target path.
     * @param aliases An array of compiled aliases.
     * @param mode The resolution mode ('local' or 'cdn').
     */
    public updateImports(aliases: AliasCompiler.CompiledAlias[], mode: 'local' | 'cdn'): void {
        if (!this.data.imports) this.data.imports = {};

        for (const aliasObj of aliases) {
            const key = aliasObj.isWildcard ? `${aliasObj.alias}/` : aliasObj.alias;

            let target = mode === 'cdn' && aliasObj.targets.cdn
                ? aliasObj.targets.cdn 
                : aliasObj.targets.local;

            if (target === aliasObj.targets.local) {
                target = path.relative(this.projectRoot, target);
                if (!target.startsWith('./')) target = `./${target}`;
                target = Utilities.Path.normalize(target);
            }
            if (aliasObj.isWildcard) {
                if (!target.endsWith('/')) target += '/';
            }

            this.data.imports[key] = target;
        }
    }
    public async save(filename: string = this.filename): Promise<void> {
        await ImportMap.save(this.projectRoot, filename, this.data, { logger: this.logger });
    }
    public static async save(projectRoot: string, filename: string, data: ImportMap.Data, options: ImportMap.Options = {}): Promise<void> {
        const logger = options.logger || new Logger({ prefix: 'IMP-MAP' });
        const importMapPath = path.resolve(projectRoot, filename);
        const folder = path.dirname(importMapPath);
        if (!await File.exists(folder)) await File.mkdir(folder, { recursive: true });
        const json = JSON.stringify(data, null, 4);
        await File.write(importMapPath, json);
        logger.log(`&C2Generated &C4${filename}`);
    }
    /**
     * Factory method: Loads, validates (or creates default), and returns an instance of the ImportMap class.
     * It checks if the specified import map file exists, and if it does, it attempts to read and parse its content as JSON.
     * If the file does not exist or contains invalid JSON, it initializes the data with a default structure containing an empty "imports" object.
     * Finally, it returns a new instance of ImportMap with the loaded or default data, allowing for further manipulation and saving of the import map configuration.
     * @param projectRoot The root directory of the project where the import map file is located.
     * @param filename The name of the import map file to load (e.g., 'import-map.json').
     * @param options Additional options for loading, such as a logger for logging messages during the load process.
     * @returns A promise that resolves to an instance of ImportMap initialized with the loaded or default data.
     */
    public static async load(projectRoot: string, filename: string, options: ImportMap.Options = {}): Promise<ImportMap> {
        const logger = options.logger || new Logger({ prefix: 'IMP-MAP' });
        const importMapPath = path.resolve(projectRoot, filename);
        let data: ImportMap.Data = { imports: {} };
        if (!await File.exists(importMapPath)) {
            logger.warn(`&C3${filename} not found. Creating defaults...`);
            const data = { imports: {} };
            await ImportMap.save(projectRoot, filename, data, { logger });
        } else {
            const content = await File.read(importMapPath, 'utf-8');
            const json = JSON.parse(content);
            data = json;
        } return new ImportMap(data, projectRoot, filename, { logger });
    }
}
export namespace ImportMap {
    export interface Data {
        imports: Record<string, string>;
    }
    export interface Options {
        logger?: Logger;
    }
}
export default ImportMap;
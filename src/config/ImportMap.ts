import { Logger } from '@netfeez/vterm';
import { File, Path } from '@netfeez/common-node';

import AliasCompiler from '../support/PathResolver/AliasCompiler.js';
import schema from '../schema/schema.js';

export class ImportMap {
    protected logger: Logger;

    constructor(
        protected data: ImportMap.Data,
        protected path: string,
        options: ImportMap.Options = {}
    ) { 
        this.logger = options.logger || new Logger({ name: 'IMP-MAP' }); 
    }

    /**
     * Updates the import map data based on the provided compiled aliases.
     * It constructs an "imports" section where each alias is mapped to its target path.
     * @param aliases An array of compiled aliases.
     * @param mode The resolution mode ('local' or 'cdn').
     */
    public updateImports(aliases: AliasCompiler.CompiledAlias[], mode: 'local' | 'cdn'): void {
        if (!this.data.imports) this.data.imports = {};

        const projectRoot = Path.dirname(this.path);

        for (const aliasObj of aliases) {
            const key = aliasObj.isWildcard ? `${aliasObj.alias}/` : aliasObj.alias;

            let target = mode === 'cdn' && aliasObj.targets.cdn
                ? aliasObj.targets.cdn 
                : aliasObj.targets.local;

            if (target === aliasObj.targets.local) {
                target = Path.diff(projectRoot, target);
                target = target.startsWith('/') ? target : `/${target}`;
                target = Path.normalize(target);
            }
            if (aliasObj.isWildcard) {
                if (!target.endsWith('/')) target += '/';
            }

            this.data.imports[key] = target;
        }
    }
    /**
     * Saves the provided import map data to a specified file path.
     * It ensures that the directory for the file exists, converts the data to a JSON string with proper formatting, and writes it to the file system.
     * The method also includes logging to inform users when the save operation is successful.
     * @param path The path to the import map file to save.
     * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
     */
    public async save(path: string = this.path): Promise<void> {
        await ImportMap.save(path, this.data, { logger: this.logger });
        if (path !== this.path) this.path = path;
    }
    /**
     * Saves the provided import map data to a specified file path.
     * It ensures that the directory for the file exists, converts the data to a JSON string with proper formatting, and writes it to the file system.
     * The method also includes logging to inform users when the save operation is successful.
     * @param path The path to the import map file to save.
     * @param data The import map data to be saved.
     * @param options Additional options for saving, such as a logger for logging messages during the save process.
     * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
     */
    public static async save(path: string, data: ImportMap.Data, options: ImportMap.Options = {}): Promise<void> {
        const logger = options.logger || new Logger({ name: 'IMP-MAP' });
        const folder = Path.dirname(path);
        await File.ensureDir(folder);
        const json = JSON.stringify(data, null, 4);
        await File.write(path, json);
        const filename = Path.fileName(path);
        logger.log(`&C2Saved file &C4${filename}`);
    }
    /**
     * Factory method: Loads, validates (or creates default), and returns an instance of the ImportMap class.
     * It checks if the specified import map file exists, and if it does, it attempts to read and parse its content as JSON.
     * If the file does not exist or contains invalid JSON, it initializes the data with a default structure containing an empty "imports" object.
     * Finally, it returns a new instance of ImportMap with the loaded or default data, allowing for further manipulation and saving of the import map configuration.
     * @param path The path to the import map file to load.
     * @param options Additional options for loading, such as a logger for logging messages during the load process.
     * @returns A promise that resolves to an instance of ImportMap initialized with the loaded or default data.
     */
    public static async load(path: string, options: ImportMap.Options = {}): Promise<ImportMap> {
        const logger = options.logger || new Logger({ name: 'IMP-MAP' });
        let data: ImportMap.Data;
        if (!await File.exists(path)) {
            const filename = Path.fileName(path);
            logger.warn(`&C3${filename} not found. Creating defaults...`);
            data = schema.ImportMap.processData({});
            // await ImportMap.save(projectRoot, filename, data, { logger });
        } else {
            const content = await File.read(path, 'utf-8');
            const json = JSON.parse(content);
            data = schema.ImportMap.processData(json);
        } return new ImportMap(data, path, { logger });
    }
}
export namespace ImportMap {
    export type Data = schema.ImportMap.Root;
    export interface Options {
        logger?: Logger;
    }
}
export default ImportMap;
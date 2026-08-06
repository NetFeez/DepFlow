import { Logger } from '@netfeez/vterm';
import { File, Path } from '@netfeez/common-node';

import AliasCompiler from '../support/PathResolver/AliasCompiler.js';
import schema from './schema/schema.js';

export class TSConfig {
    protected logger: Logger;

    constructor(
        protected data: TSConfig.Data,
        protected path: string,
        options: TSConfig.Options = {}
    ) { this.logger = options.logger || new Logger({ name: 'TS-CFG' }); }
    /**
     * Updates the paths in the tsconfig data based on the provided compiled aliases.
     * It ensures that the compilerOptions and paths properties exist in the tsconfig data, and then iterates through the compiled aliases to construct the appropriate path mappings.
     * For each alias, it calculates the relative path from the project root to the local target and normalizes it. If the alias is a wildcard, it appends '/*' to the target path.
     * Finally, it updates the paths in the tsconfig data with the new mappings, allowing TypeScript to resolve module paths according to the defined aliases.
     * @param aliases An array of compiled aliases containing alias names, target paths, and wildcard information.
     */
    public updatePaths(aliases: AliasCompiler.CompiledAlias[]): void {
        if (!this.data.compilerOptions) this.data.compilerOptions = {};
        if (!this.data.compilerOptions.paths) this.data.compilerOptions.paths = {};

        const projectRoot = Path.dirname(this.path);

        for (const alias of aliases) {
            const key = alias.isWildcard ? `${alias.alias}/*` : alias.alias;
            
            let target = Path.diff(projectRoot, alias.targets.local);
            target = target.startsWith('.') ? target : `./${target}`;
            target = Path.normalize(target);

            let typeTarget: string | undefined;
            if (alias.targets.type) {
                typeTarget = Path.diff(projectRoot, alias.targets.type);
                typeTarget = typeTarget.startsWith('.') ? typeTarget : `./${typeTarget}`;
                typeTarget = Path.normalize(typeTarget);
            }

            if (alias.isWildcard) {
                const suffix = target.endsWith('/') ? '*' : '/*';
                target = `${target}${suffix}`;
                if (typeTarget) {
                    typeTarget = `${typeTarget}${suffix}`;
                }
            }

            this.data.compilerOptions.paths[key] = typeTarget ? [typeTarget, target] : [target];
        }
    }
    /**
     * Saves the current tsconfig data to a file.
     * It constructs the path to the tsconfig file using the project root and filename, converts the data to a JSON string with proper formatting, and writes it to the file system using the File.write method.
     * The method also includes error handling to log any issues that occur during the save process, ensuring that users are informed of any problems when attempting to save the tsconfig configuration.
     * @param path The path to the tsconfig file where the data should be saved.
     * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
     */
    public async save(path: string = this.path): Promise<void> {
        await TSConfig.save(path, this.data, { logger: this.logger });
        if (path !== this.path) this.path = path;
    }
    /**
     * Static method to save tsconfig data to a specified file. It takes the project root, filename, tsconfig data, and options (including a logger) as parameters.
     * The method constructs the full path to the tsconfig file, converts the data to a formatted JSON string, and writes it to the file system.
     * It also includes error handling to log any issues that arise during the save process, providing feedback on whether the operation was successful or if it encountered problems.
      * @param path The path to the tsconfig file where the data should be saved.
      * @param data The tsconfig data to be saved, structured according to the defined schema.
      * @param options Additional options for saving, such as a logger for logging messages during the save process.
      * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
      * @throws Will throw an error if there is an issue during the save process, which can be caught by the caller to handle it appropriately.
     */
    public static async save(path: string, data: TSConfig.Data, options: TSConfig.Options = {}): Promise<void> {
        const logger = options.logger || new Logger({ name: 'TS-CFG' });
        const json = JSON.stringify(data, null, 4);
        await File.write(path, json);
        const filename = Path.fileName(path);
        logger.log(`&C2Saved file &C4${filename}&C2 successfully.`);
    }
    /**
     * Static method to load tsconfig data from a specified file.
     * It takes the project root, filename, and options (including a logger) as parameters.
     * The method checks if the tsconfig file exists, and if it does, it reads the content, parses it as JSON, and processes it using the defined schema to ensure it conforms to the expected structure.
     * If the file does not exist, it creates a default tsconfig data object using the schema. Finally, it returns an instance of the Tsconfig class initialized with the loaded or default data.
     * @param path The path to the tsconfig file to load.
     * @param options Additional options for loading, such as a logger for logging messages during the load process.
     * @returns A promise that resolves to an instance of the Tsconfig class containing the loaded data, or rejects if there is an error during the load process.
      * @throws Will throw an error if there is an issue during the load process, which
     */
    public static async load(path: string, options: TSConfig.Options): Promise<TSConfig> {
        const logger = options.logger || new Logger({ name: 'TS-CFG' });
        let data: TSConfig.Data;
        if (!await File.exists(path)) {
            const filename = Path.fileName(path);
            logger.warn(`&C3${filename} not found. Creating defaults...`);
            data = schema.TSConfig.processData({});
            // this.save(projectRoot, filename, data, { logger }).catch(err => logger.error(`Failed to create default tsconfig:`, err.message));
        } else {
            const content = await File.read(path, 'utf-8');
            const json = JSON.parse(content);
            data = schema.TSConfig.processData(json);
        } return new TSConfig(data, path, { logger });
    }
}

export namespace TSConfig {
    export type Data = schema.TSConfig.Root;
    export interface Options {
        logger?: Logger
    }
}

export default TSConfig;
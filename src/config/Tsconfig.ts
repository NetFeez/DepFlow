import PATH from 'node:path';

import { Logger } from '@netfeez/vterm';
import { File, Path } from '@netfeez/common-node';

import schemas from "./schemas.js";
import AliasCompiler from '../support/PathResolver/AliasCompiler.js';

export class Tsconfig {
    protected logger: Logger;

    constructor(
        protected data: Tsconfig.Data,
        protected projectRoot: string,
        protected filename: string,
        options: Tsconfig.Options = {}
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

        for (const aliasObj of aliases) {
            const key = aliasObj.isWildcard ? `${aliasObj.alias}/*` : aliasObj.alias;
            
            let target = PATH.relative(this.projectRoot, aliasObj.targets.local);
            target = Path.normalize(target);

            if (aliasObj.isWildcard) {
                const suffix = target.endsWith('/') ? '*' : '/*';
                target = `${target}${suffix}`;
            }

            this.data.compilerOptions.paths[key] = [target];
        }
    }
    /**
     * Saves the current tsconfig data to a file.
     * It constructs the path to the tsconfig file using the project root and filename, converts the data to a JSON string with proper formatting, and writes it to the file system using the File.write method.
     * The method also includes error handling to log any issues that occur during the save process, ensuring that users are informed of any problems when attempting to save the tsconfig configuration.
     * @param filename The name of the tsconfig file to save (default is the instance's filename property).
     * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
     */
    public async save(filename: string = this.filename): Promise<void> {
        await Tsconfig.save(this.projectRoot, filename, this.data, { logger: this.logger });
    }
    /**
     * Static method to save tsconfig data to a specified file. It takes the project root, filename, tsconfig data, and options (including a logger) as parameters.
     * The method constructs the full path to the tsconfig file, converts the data to a formatted JSON string, and writes it to the file system.
     * It also includes error handling to log any issues that arise during the save process, providing feedback on whether the operation was successful or if it encountered problems.
      * @param projectRoot The root directory of the project where the tsconfig file should be saved.
      * @param filename The name of the tsconfig file (default is 'tsconfig.json').
      * @param data The tsconfig data to be saved, structured according to the defined schema.
      * @param options Additional options for saving, such as a logger for logging messages during the save process.
      * @returns A promise that resolves when the save operation is complete, or rejects if an error occurs during the process.
      * @throws Will throw an error if there is an issue during the save process, which can be caught by the caller to handle it appropriately.
     */
    public static async save(projectRoot: string, filename: string = 'tsconfig.json', data: Tsconfig.Data, options: Tsconfig.Options = {}): Promise<void> {
        const logger = options.logger || new Logger({ name: 'TS-CFG' });
        const tsconfigPath = PATH.resolve(projectRoot, filename);
        const folder = PATH.dirname(tsconfigPath);
        if (!await File.exists(folder)) await File.mkdir(folder, { recursive: true });
        const json = JSON.stringify(data, null, 4);
        await File.write(tsconfigPath, json);
        logger.log(`&C2Updated &C4${filename}&C2 successfully.`);
    }
    /**
     * Static method to load tsconfig data from a specified file.
     * It takes the project root, filename, and options (including a logger) as parameters.
     * The method checks if the tsconfig file exists, and if it does, it reads the content, parses it as JSON, and processes it using the defined schema to ensure it conforms to the expected structure.
     * If the file does not exist, it creates a default tsconfig data object using the schema. Finally, it returns an instance of the Tsconfig class initialized with the loaded or default data.
     * @param projectRoot The root directory of the project where the tsconfig file is located.
     * @param filename The name of the tsconfig file to load (default is 'tsconfig.json').
     * @param options Additional options for loading, such as a logger for logging messages during the load process.
     * @returns A promise that resolves to an instance of the Tsconfig class containing the loaded data, or rejects if there is an error during the load process.
      * @throws Will throw an error if there is an issue during the load process, which
     */
    public static async load(projectRoot: string, filename: string, options: Tsconfig.Options): Promise<Tsconfig> {
        const logger = options.logger || new Logger({ name: 'TS-CFG' });
        const tsconfigPath = PATH.resolve(projectRoot, filename);
        let data: Tsconfig.Data;
        if (!await File.exists(tsconfigPath)) {
            logger.warn(`&C3${filename} not found. Creating defaults...`);
            data = schemas.basicTsconfig.processData({});
            this.save(projectRoot, filename, data, { logger }).catch(err => logger.error(`Failed to create default tsconfig:`, err.message));
        } else {
            const content = await File.read(tsconfigPath, 'utf-8');
            const json = JSON.parse(content);
            data = schemas.basicTsconfig.processData(json);
        } return new Tsconfig(data, projectRoot, filename, { logger });
    }
}

export namespace Tsconfig {
    export type Data = schemas.basicTsconfig['infer'];
    export interface Options {
        logger?: Logger
    }
}

export default Tsconfig;
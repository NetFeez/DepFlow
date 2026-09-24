import { Logger } from '@netfeez/vterm';
import { Path } from '@netfeez/common-node';

import AliasCompiler from '../support/PathResolver/AliasCompiler.js';
import schema from '../schema/schema.js';
import Settings from '../support/Settings.js';

export class TSConfig extends Settings<typeof schema.TSConfig> {
    protected static schema = schema.TSConfig;
    protected logger: Logger;

    constructor(data: TSConfig.Data, options: TSConfig.Options = {}) {
        super(data, options);
        this.logger = options.logger || new Logger({ name: 'TS-CFG' });
    }
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

        const projectRoot = Path.dirname(this.vPath!);

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
    public async save(path: string = this.vPath!): Promise<void> {
        await super.save(path);
        if (path !== this.vPath) this.vPath = path;
        const filename = Path.fileName(path);
        this.logger.log(`&C2Saved file &C4${filename}&C2 successfully.`);
    }
}

export namespace TSConfig {
    export type Data = schema.TSConfig.Root;
    export interface Options extends Settings.Options {
        logger?: Logger;
    }
}

export default TSConfig;
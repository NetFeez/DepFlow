/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility for path resolution with Local/CDN support and dual path fixing.
 * @license Apache-2.0
 */
import path from 'path';
import syncFs, { promises as fs } from 'fs';
import { Logger, Utilities } from 'vortez';
import File from './File.js';
import { schemas } from '../config/schemas.js';

export class PathResolver {
    public static readonly IMPORT_REGEX = /(from\s+['"])([^'"]+)(['"])/g;
    public static readonly PROJECT_ROOT = process.cwd();
    public static readonly EXTENSIONS = ['.js', '.d.ts', '.mjs', '.cjs'];
    
    public absoluteOutDir: string;
    protected vCompiledAliases: PathResolver.ResolvedAlias[] | null = null;
    protected logger: Logger;

    public constructor(
        public readonly config: schemas.config['infer'],
        public readonly options: PathResolver.Options = { mode: 'local' },
        public readonly projectRoot: string = PathResolver.PROJECT_ROOT
    ) {
        this.logger = options.logger || new Logger({ prefix: 'PathResolver' });

        const outDir = config.outDir || '.';
        const fullPath = path.isAbsolute(outDir) ? outDir : path.join(projectRoot, outDir);
        this.absoluteOutDir = path.resolve(fullPath);
    }
    /** compile the aliases from the config into a flat array for easy lookup during replacement. */
    public get aliases(): PathResolver.ResolvedAlias[] {
        if (this.vCompiledAliases) return this.vCompiledAliases;

        const result: PathResolver.ResolvedAlias[] = [];
        const allDeps = [
            ...(this.config.dependencies || []),
            ...(this.config.npmDependencies || [])
        ];

        for (const dep of allDeps) {
            if (typeof dep !== 'object' || !dep.resolver) continue;

            for (const entry of dep.resolver) {
                const { alias, target } = entry;
                if (!alias || !target) continue;

                const isWildcard = alias.endsWith('/*');
                const cleanAlias = alias.replace(/\/\*$/, '');

                let finalTarget: string;
                if (this.options.mode === 'cdn' && typeof target === 'object' && target.cdn) {
                    finalTarget = target.cdn.replace(/\/\*$/, '');
                } else {
                    const localPath = typeof target === 'string' ? target : target.local;
                    const cleanLocal = localPath.replace(/\/\*$/, '');
                    
                    finalTarget = path.isAbsolute(cleanLocal) 
                        ? cleanLocal 
                        : path.resolve(this.projectRoot, cleanLocal);
                }

                result.push({
                    alias: cleanAlias,
                    target: finalTarget,
                    isWildcard,
                    isRemote: finalTarget.startsWith('http')
                });
            }
        }

        this.vCompiledAliases = result;
        return result;
    }
    /**
     * Main method to run the path resolver. It scans all relevant files in the output directory,
     * applies path replacements based on the configured aliases, and updates the files in place. It also logs the process and results.
     */
    public async rewritePaths(): Promise<void> {
        this.logger.log(`&C2Starting path resolver in &C3${this.options.mode} &C2mode...`);
        
        if (!await File.exists(this.absoluteOutDir)) {
            return void this.logger.warn(`The output directory &C4${this.absoluteOutDir}&R does not exist.`);
        }

        const files = await PathResolver.getAllFiles(this.absoluteOutDir, PathResolver.EXTENSIONS);
        this.logger.log(`&C2Found &C3${files.length} &C2files in &C4${this.absoluteOutDir}.`);

        let rewrittenCount = 0;
        for (const file of files) {
            if (await this.processFile(file)) rewrittenCount++;
        }
        this.logger.log(`&C2Path aliases resolved in &C3${rewrittenCount} &C2files.`);
    }
    /**
     * Processes a single file, replacing import paths based on the configured aliases. It reads the file content, applies the replacements, and writes back if any changes were made.
     * It returns a boolean indicating whether the file was modified.
     * @param file The path to the file being processed.
     */
    protected async processFile(file: string): Promise<boolean> {
        const content = await fs.readFile(file, 'utf8');
        const newContent = content.replace(PathResolver.IMPORT_REGEX, (match, prefix, modulePath, suffix) => {
            return this.replaceLogic(file, match, prefix, modulePath, suffix);
        });

        if (content === newContent) return false;
        await fs.writeFile(file, newContent, 'utf8');
        return true;
    }
    /**
     * Core logic for replacing a matched import path. It checks if the modulePath matches any configured alias (considering wildcards), and if so, constructs the new path accordingly. For remote targets, it returns the full URL. For local targets, it calculates the relative path from the current file to the target and normalizes it.
     * This method is designed to be called for each match found in the file content, allowing for multiple replacements per file if necessary.
     * @param file The current file being processed, used to calculate relative paths for local targets.
     * @param match The full matched string from the regex, used to reconstruct the import statement.
     * @param prefix The part of the import statement before the module path (e.g., "from '").
     * @param modulePath The actual module path that was matched and needs to be checked against aliases.
     * @param suffix The part of the import statement after the module path (e.g., "'").
     */
    protected replaceLogic(file: string, match: string, prefix: string, modulePath: string, suffix: string): string {
        const aliasCfg = this.aliases.find(c => 
            c.isWildcard ? modulePath.startsWith(`${c.alias}/`) : modulePath === c.alias
        );

        if (!aliasCfg) return match;

        let resolvedPath: string;

        if (aliasCfg.isWildcard) {
            const subPath = modulePath.substring(aliasCfg.alias.length + 1);
            resolvedPath = aliasCfg.isRemote 
                ? `${aliasCfg.target}/${subPath}`
                : path.join(aliasCfg.target, subPath);
        } else {
            resolvedPath = aliasCfg.target;
        }

        if (aliasCfg.isRemote) return `${prefix}${resolvedPath}${suffix}`;

        const currentFileDir = path.dirname(file);
        let relativeTarget = path.relative(currentFileDir, resolvedPath);
        
        if (!relativeTarget.startsWith('.')) relativeTarget = `./${relativeTarget}`;
        
        return `${prefix}${Utilities.Path.normalize(relativeTarget)}${suffix}`;
    }
    /**
     * Synchronizes the configured path aliases with the tsconfig.json file.
     * It reads the existing tsconfig, updates the compilerOptions.paths section based on the configured aliases, and writes back the changes.
     * It handles both wildcard and exact aliases, ensuring that directory mappings are correctly represented with a trailing "/*". It also logs the process and any issues encountered, such as missing tsconfig or write errors.
     * This method is intended to be called after the path resolver has processed the files, ensuring that the tsconfig paths are in sync with the actual file structure and alias configuration.
     */
    public async syncTsConfig(): Promise<void> {
        if (!this.config.tsconfig) return void this.logger.warn(`&C3Warning: No tsconfig specified in config.`);
        const tsconfigName = this.config.tsconfig;
        const tsconfigPath = path.resolve(this.projectRoot, tsconfigName);
        
        if (!await File.exists(tsconfigPath)) return void this.logger.warn(`&C3Warning: ${tsconfigName} not found.`);

        try {
            const tsConfigContent = JSON.parse(await File.read(tsconfigPath));
            
            if (!tsConfigContent.compilerOptions) tsConfigContent.compilerOptions = {};
            if (!tsConfigContent.compilerOptions.paths) tsConfigContent.compilerOptions.paths = {};

            for (const aliasObj of this.aliases) {
                const isDir = aliasObj.isWildcard || aliasObj.alias.endsWith('/');
                const baseAlias = aliasObj.alias.replace(/\/$/, '');
                
                const key = isDir ? `${baseAlias}/*` : baseAlias;
                
                let localTarget = path.relative(this.projectRoot, aliasObj.target);
                localTarget = Utilities.Path.normalize(localTarget);

                if (isDir) {
                    const separator = localTarget.endsWith('/') ? '' : '/';
                    localTarget = `${localTarget}${separator}*`;
                }

                tsConfigContent.compilerOptions.paths[key] = [localTarget];
            }

            await File.write(tsconfigPath, JSON.stringify(tsConfigContent, null, 4));
            this.logger.log(`&C2Updated paths in &C4${tsconfigName}`);
        } catch (error: any) {
            this.logger.error(`Failed to sync tsconfig:`, error.message);
        }
    }
    /**
     * Generates an import map file based on the configured path aliases. It constructs an import map object with an "imports" section, where each alias is mapped to its corresponding target path. For remote targets, it uses the full URL, while for local targets, it calculates the relative path from the project root and normalizes it.
     * The generated import map is then written to the specified location in the project, and any necessary directories are created if they do not exist.
     * It also logs the process and any issues encountered, such as missing import map configuration or write errors.
     * This method is useful for projects that utilize import maps for module resolution, ensuring that the import map is always up to date with the configured aliases and can be used effectively during development and deployment.
     */
    public async syncImportMap(): Promise<void> {
        if (!this.config.importmap) return void this.logger.warn(`&C3Warning: No importmap specified in config.`);
        const importMapName = this.config.importmap;
        const importMapPath = path.resolve(this.projectRoot, importMapName);
        const importMap:{
            imports: Record<string, string>;
        } = { imports: {} };

        for (const aliasObj of this.aliases) {
            const isDirectory = aliasObj.isWildcard || aliasObj.alias.endsWith('/');
            const key = isDirectory && !aliasObj.alias.endsWith('/') 
                ? `${aliasObj.alias}/` 
                : aliasObj.alias;
            
            let val = aliasObj.target;

            if (!aliasObj.isRemote) {
                val = path.relative(this.projectRoot, aliasObj.target);
                if (!val.startsWith('.')) val = `./${val}`;
                val = Utilities.Path.normalize(val);
            }

            if (key.endsWith('/') && !val.endsWith('/')) {
                val += '/';
            }
            
            importMap.imports[key] = val;
        }

        const folder = Utilities.Path.dirname(importMapPath);
        if (!await File.exists(folder)) await File.mkdir(folder, { recursive: true });
        await File.write(importMapPath, JSON.stringify(importMap, null, 4));
        this.logger.log(`&C2Generated &C4${importMapName}`);
    }
    /**
     * Watches the output directory for changes to files with specified extensions and automatically re-runs the path resolver on those files when changes are detected.
     * It uses fs.watch to monitor the directory recursively, and implements a debounce mechanism to prevent multiple rapid triggers for the same file.
     * When a change is detected, it processes the affected file and logs the update.
     * This method allows for real-time updates to the resolved paths during development, ensuring that any changes to the output files are immediately reflected in the path resolution without needing to manually re-run the resolver.
     */
    public async watch(): Promise<void> {
        await this.rewritePaths();
        this.logger.log(`&C2Watching for changes in &C4${this.absoluteOutDir}...`);
        
        const queue = new Map<string, NodeJS.Timeout>();
        syncFs.watch(this.absoluteOutDir, { recursive: true }, (eventType, filename) => {
            if (!filename || !PathResolver.EXTENSIONS.some(ext => filename.endsWith(ext))) return;
            
            const fullPath = path.join(this.absoluteOutDir, filename);
            if (queue.has(fullPath)) clearTimeout(queue.get(fullPath)!);
            
            queue.set(fullPath, setTimeout(async () => {
                try {
                    if (await this.processFile(fullPath)) this.logger.log(`&C2File &C4${filename}&C2 updated.`);
                } catch (e) {}
                queue.delete(fullPath);
            }, 300));
        });
    }
    /**
     * Recursively retrieves all files with specified extensions from a given directory.
     * It uses fs.readdir with the "withFileTypes" option to efficiently determine if an entry is a file or a directory.
     * For directories, it calls itself recursively to gather files from subdirectories. For files, it checks if their extensions match the provided list and includes them in the result.
     * This method returns a flat array of file paths that can be processed by the path resolver.
     * @param dir The directory to scan for files.
     * @param extensions An array of file extensions to filter the results (e.g., ['.js', '.ts']).
     * @returns A promise that resolves to an array of file paths matching the specified extensions.
     */
    public static async getAllFiles(dir: string, extensions: string[]): Promise<string[]> {
        const result: string[] = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) result.push(...(await PathResolver.getAllFiles(fullPath, extensions)));
            else if (extensions.some(ext => fullPath.endsWith(ext))) result.push(fullPath);
        }
        return result;
    }
}

export namespace PathResolver {
    export interface Options {
        mode: 'local' | 'cdn';
        logger?: Logger;
    }
    export interface ResolvedAlias {
        alias: string;
        target: string;
        isWildcard: boolean;
        isRemote: boolean;
    }
}

export default PathResolver;
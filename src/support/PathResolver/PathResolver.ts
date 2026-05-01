/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility for path resolution with Local/CDN support and dual path fixing.
 * @license Apache-2.0
 */
import PATH from "node:path";
import FS, { promises as FSP } from 'node:fs';

import { File } from '@netfeez/common-node';
import { Logger } from "@netfeez/vterm";

import Utils from '../Utils.js';
import schemas from '../../config/schemas.js';
import PathRewriter from './PathRewriter.js';
import AliasCompiler from './AliasCompiler.js';

export class PathResolver {
    public static readonly PROJECT_ROOT = process.cwd();
    public static readonly EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

    protected readonly logger: Logger;
    protected readonly rewriter: PathRewriter;
    protected readonly absoluteOutDir: string;
    public readonly aliases: AliasCompiler.CompiledAlias[];

    public constructor(
        public readonly config: schemas.config['infer'],
        public readonly options: PathResolver.Options = {},
    ) {
        this.logger = options.logger || new Logger({ name: 'PATH-RW' });
        
        const outDir = config.outDir || '.';
        this.absoluteOutDir = !PATH.isAbsolute(outDir)
            ? PATH.resolve(PathResolver.PROJECT_ROOT, outDir)
            : outDir;

        this.aliases = new AliasCompiler(PathResolver.PROJECT_ROOT).compile(config);
        this.rewriter = new PathRewriter(this.aliases, PathResolver.PROJECT_ROOT);
    }
    /**
     * Resolves and rewrites paths in built files based on the provided mode (local or CDN).
     * It processes all files in the output directory, rewriting import paths according to the configured aliases.
     * @param mode The resolution mode ('local' or 'cdn') to determine which target paths to use.
     */
    public async rewritePaths(mode: PathResolver.Mode): Promise<void> {
        this.logger.log(`&C2Starting path resolver in &C3${mode} &C2mode...`);
        
        if (!await File.exists(this.absoluteOutDir)) return void this.logger.warn(`Directory &C4${this.absoluteOutDir}&R not found.`);

        // const files = await File.getAllFiles(this.absoluteOutDir, PathResolver.EXTENSIONS);
        const files = [];
        files.push(...await File.find('**/*.js'));
        files.push(...await File.find('**/*.ts'));
        files.push(...await File.find('**/*.jsx'));
        files.push(...await File.find('**/*.tsx'));

        let rewrittenCount = 0;
        for (const file of files) {
            if (await this.processFile(file, mode)) rewrittenCount++;
        }
        this.logger.log(`&C2Path aliases resolved in &C3${rewrittenCount} &C2files.`);
    }
    /**
     * Processes a single file, rewriting import paths based on the configured aliases and the specified mode (local or CDN).
     * It reads the file content, applies the path rewriting logic, and writes the updated content back to the file system if any changes were made.
     * @param file The path of the file to process.
     * @param mode The resolution mode ('local' or 'cdn') to determine which target paths to use for rewriting.
     * @returns A boolean indicating whether the file was modified (true if rewritten, false if no changes were made).
     */
    protected async processFile(file: string, mode: PathResolver.Mode): Promise<boolean> {
        try {
            const content = await FSP.readFile(file, 'utf8');
            const newContent = this.rewriter.rewrite(content, file, mode);

            if (content === newContent) return false;
            
            await FSP.writeFile(file, newContent, 'utf8');
            return true;
        } catch (error: any) {
            this.logger.error(`Failed to process file &C4${file}:`, error.message);
            return false;
        }
    }
    /**
     * Watches the output directory for changes and automatically rewrites paths in modified files based on the configured aliases and specified mode (local or CDN).
     * It sets up a file system watcher that listens for changes in the output directory, and when a relevant file is modified, it triggers the path rewriting process for that file.
     * The method includes debouncing to prevent excessive processing during rapid file changes, ensuring efficient handling of updates while maintaining responsiveness.
     * @param mode The resolution mode ('local' or 'cdn') to determine which target paths to use for rewriting when changes are detected.
     * @returns A promise that resolves when the watcher is set up and running, allowing the application to continue monitoring for changes indefinitely until manually stopped.
     * @throws Will throw an error if there is an issue setting up the file system watcher or processing files, which can be caught by the caller to handle it appropriately.
     */
    public async watch(mode: PathResolver.Mode): Promise<void> {
        await this.rewritePaths(mode);
        this.logger.log(`&C2Watching for changes in &C4${this.absoluteOutDir}...`);

        const debouncedProcessor = Utils.debounce(async (fullPath: string, filename: string) => {
            if (await this.processFile(fullPath, mode)) {
                this.logger.log(`&C2File &C4${filename}&C2 updated.`);
            }
        }, 300);

        FS.watch(this.absoluteOutDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            
            const isTargetExtension = PathResolver.EXTENSIONS.some(ext => filename.endsWith(ext));
            if (!isTargetExtension) return;

            const fullPath = PATH.join(this.absoluteOutDir, filename);
            debouncedProcessor(fullPath, filename);
        });
    }
}
export namespace PathResolver {
    export type Mode = 'local' | 'cdn';
    export interface Options {
        logger?: Logger;
    }
}
export default PathResolver;
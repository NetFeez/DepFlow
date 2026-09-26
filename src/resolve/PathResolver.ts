/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Path resolution with Local/CDN support and dual path fixing.
 * @license Apache-2.0
 */
import FS, { promises as FSP } from 'node:fs';

import { Async, File, Path } from '@netfeez/common-node';
import { Logger } from "@netfeez/vterm";

import PathRewriter from './PathRewriter.js';
import AliasCompiler from './AliasCompiler.js';
import schema from '../schema/schema.js';

export class PathResolver {
    public static readonly EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

    protected readonly logger: Logger;
    protected readonly rewriter: PathRewriter;
    protected readonly outDir: string;
    public readonly aliases: AliasCompiler.CompiledAlias[];

    public constructor(
        data: schema.Config,
        projectRoot: string,
        public readonly options: PathResolver.Options = {},
    ) {
        this.logger = options.logger || new Logger({ name: 'PATH-RW' });
        
        const outDir = data.outDir;
        this.outDir = !Path.isAbsolute(outDir)
            ? Path.resolve(projectRoot, outDir)
            : outDir;

        this.aliases = new AliasCompiler(projectRoot).compile(data);
        this.rewriter = new PathRewriter(this.aliases);
    }
    /**
     * Resolves and rewrites paths in built files based on the provided mode (local or CDN).
     * It processes all files in the output directory, rewriting import paths according to the configured aliases.
     * @param mode - The resolution mode ('local' or 'cdn') to determine which target paths to use.
     */
    public async rewritePaths(mode: PathResolver.Mode): Promise<void> {
        this.logger.log(`&C2Starting path resolver in &C3${mode} &C2mode for ${this.outDir}...`);
        
        if (!await File.exists(this.outDir)) return void this.logger.warn(`Directory &C4${this.outDir}&R not found.`);

        const filter = '**/*.{js,ts,jsx,tsx,{c,m}js}';
        const files: string[] = await File.find(filter, this.outDir);

        let rewrittenCount = 0;
        const limiter = Async.currencyLimiter(16);
        const promises = files.map((file) => {
            file = Path.join(this.outDir, file);
            return limiter(() => this.processFile(file, mode).then(changed => {
                if (changed) rewrittenCount++;
            }));
        });
        await Promise.all(promises);
        this.logger.log(`&C2Path aliases resolved in &C3${rewrittenCount} &C2files.`);
    }
    /**
     * Processes a single file, rewriting import paths based on the configured aliases and the specified mode (local or CDN).
     * It reads the file content, applies the path rewriting logic, and writes the updated content back to the file system if any changes were made.
     * @param file - The path of the file to process.
     * @param mode - The resolution mode ('local' or 'cdn') to determine which target paths to use for rewriting.
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
     * @param mode - The resolution mode ('local' or 'cdn') to determine which target paths to use for rewriting when changes are detected.
     * @returns A promise that resolves when the watcher is set up and running, allowing the application to continue monitoring for changes indefinitely until manually stopped.
     * @throws Will throw an error if there is an issue setting up the file system watcher or processing files, which can be caught by the caller to handle it appropriately.
     */
    public async watch(mode: PathResolver.Mode): Promise<void> {
        await this.rewritePaths(mode);
        this.logger.log(`&C2Watching for changes in &C4${this.outDir}...`);

        const debouncedProcessor = PathResolver.debounce(async (fullPath: string, filename: string) => {
            if (await this.processFile(fullPath, mode)) {
                this.logger.log(`&C2File &C4${filename}&C2 updated.`);
            }
        }, 300);

        FS.watch(this.outDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            
            const isTargetExtension = PathResolver.EXTENSIONS.some(ext => filename.endsWith(ext));
            if (!isTargetExtension) return;

            const fullPath = Path.join(this.outDir, filename);
            debouncedProcessor(fullPath, filename);
        });
    }
    /**
     * Debounces a function so it only executes after the specified delay has passed since the last invocation.
     * @param fn - The function to debounce.
     * @param delay - The number of milliseconds to wait before executing the function.
     * @returns A debounced version of the function that delays its execution.
     */
    private static debounce<Args extends any[]>(
        fn: (...args: Args) => void,
        delay: number
    ): (...args: Args) => void {
        let timeoutId: NodeJS.Timeout | null = null;
        return function(this: any, ...args: Args) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fn.apply(this, args);
                timeoutId = null;
            }, delay);
        };
    }
}
export namespace PathResolver {
    export type Mode = 'local' | 'cdn';
    export interface Options {
        logger?: Logger;
    }
}
export default PathResolver;
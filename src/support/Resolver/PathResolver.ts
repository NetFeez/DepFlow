/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility for path resolution with Local/CDN support and dual path fixing.
 * @license Apache-2.0
 */
import syncFs, { promises as fs } from 'node:fs';
import path from "node:path";

import { Logger } from "vortez";

import Utils from '../Utils.js';
import File from '../File.js';

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
        this.logger = options.logger || new Logger({ prefix: 'PathResolver' });
        
        const outDir = config.outDir || '.';
        this.absoluteOutDir = !path.isAbsolute(outDir)
            ? path.resolve(PathResolver.PROJECT_ROOT, outDir)
            : outDir;

        this.aliases = new AliasCompiler(PathResolver.PROJECT_ROOT).compile(config);
        this.rewriter = new PathRewriter(this.aliases, PathResolver.PROJECT_ROOT);
    }
    public async rewritePaths(mode: PathResolver.Mode): Promise<void> {
        this.logger.log(`&C2Starting path resolver in &C3${mode} &C2mode...`);
        
        if (!await File.exists(this.absoluteOutDir)) return void this.logger.warn(`Directory &C4${this.absoluteOutDir}&R not found.`);

        const files = await File.getAllFiles(this.absoluteOutDir, PathResolver.EXTENSIONS);

        let rewrittenCount = 0;
        for (const file of files) {
            if (await this.processFile(file, mode)) rewrittenCount++;
        }
        this.logger.log(`&C2Path aliases resolved in &C3${rewrittenCount} &C2files.`);
    }
    protected async processFile(file: string, mode: PathResolver.Mode): Promise<boolean> {
        try {
            const content = await fs.readFile(file, 'utf8');
            const newContent = this.rewriter.rewrite(content, file, mode);

            if (content === newContent) return false;
            
            await fs.writeFile(file, newContent, 'utf8');
            return true;
        } catch (error: any) {
            this.logger.error(`Failed to process file &C4${file}:`, error.message);
            return false;
        }
    }
    public async watch(mode: PathResolver.Mode): Promise<void> {
        await this.rewritePaths(mode);
        this.logger.log(`&C2Watching for changes in &C4${this.absoluteOutDir}...`);

        const debouncedProcessor = Utils.debounce(async (fullPath: string, filename: string) => {
            if (await this.processFile(fullPath, mode)) {
                this.logger.log(`&C2File &C4${filename}&C2 updated.`);
            }
        }, 300);

        syncFs.watch(this.absoluteOutDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            
            const isTargetExtension = PathResolver.EXTENSIONS.some(ext => filename.endsWith(ext));
            if (!isTargetExtension) return;

            const fullPath = path.join(this.absoluteOutDir, filename);
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
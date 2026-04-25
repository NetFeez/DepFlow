/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility for path fixing with dual support for baseUrl and rootDir.
 * @license Apache-2.0
 */
import path from 'path';
import syncFs, { promises as fs } from 'fs';
import { Logger, Utilities } from 'vortez';
import File from './File.js';

const logger = new Logger({ prefix: 'PathFixer' });

export class PathFixer {
    public static readonly IMPORT_REGEX = /(from\s+['"])([^'"]+)(['"])/g;
    public static readonly PROJECT_ROOT = process.cwd();
    public static readonly EXTENSIONS = ['js', '.d.ts'];
    
    public absoluteRoot: string;
    private _alias: PathFixer.Alias[] | null = null;

    public constructor(
        public readonly info: PathFixer.ProjectInfo,
        public readonly projectRoot: string = PathFixer.PROJECT_ROOT
    ) {
        const fullPath = path.isAbsolute(info.outDir) 
            ? info.outDir 
            : path.join(projectRoot, info.outDir);
            
        this.absoluteRoot = path.resolve(fullPath);
    }

    public get alias(): PathFixer.Alias[] {
        if (this._alias) return this._alias;
        const result: PathFixer.Alias[] = [];

        const tsConfigBase = path.resolve(this.projectRoot, this.info.baseUrl || '.');
        const sourceRoot = path.resolve(this.projectRoot, this.info.rootDir || this.info.baseUrl || '.');

        for (const [key, value] of Object.entries(this.info.paths || {})) {
            const isWildcard = key.endsWith('/*');
            const aliasBase = key.replace(/\/\*$/, '');
            
            const targetRaw = value[0].replace(/\/\*$/, '');
            const absoluteSourceTarget = path.resolve(tsConfigBase, targetRaw);
            const relativeToSourceRoot = path.relative(sourceRoot, absoluteSourceTarget);
            const absoluteBuildTarget = path.resolve(this.absoluteRoot, relativeToSourceRoot);

            result.push({  alias: aliasBase,  target: absoluteBuildTarget, isWildcard });
        }
        
        this._alias = result;
        return result;
    }

    public async run(): Promise<void> {
        logger.log('&C2Starting path fixer...');
        if (!await File.exists(this.absoluteRoot)) {
            return void logger.warn(`The root directory &C4${this.absoluteRoot}&R does not exist.`);
        }

        const files = await PathFixer.getAllFiles(this.absoluteRoot, PathFixer.EXTENSIONS);
        logger.log(`&C2Found &C3${files.length} &C2files in &C4${this.absoluteRoot}.`);
        console.log(JSON.stringify(this, null, 2));
        let rewrittenCount = 0;
        for (const file of files) {
            const changed = await this.process(file);
            if (changed) rewrittenCount++;
        }
        logger.log(`&C2Path aliases rewritten in &C3${rewrittenCount} &C2files.`);
    }

    public async watch(): Promise<void> {
        await this.run();
        logger.log(`&C2Starting watcher in &C4${this.absoluteRoot}.`);
        if (!await Utilities.fileExists(this.absoluteRoot)) {
            await fs.mkdir(this.absoluteRoot, { recursive: true });
        }
        
        const queue = new Map<string, NodeJS.Timeout>();
        syncFs.watch(this.absoluteRoot, { recursive: true }, (eventType, filename) => {
            this.watchHandler(queue, eventType, filename as string);
        });
    }

    private async process(file: string): Promise<boolean> {
        const content = await fs.readFile(file, 'utf8');
        const newContent = content.replace(PathFixer.IMPORT_REGEX, (match, prefix, modulePath, suffix) => {
            return this.processReplacer(file, match, prefix, modulePath, suffix);
        });

        if (content === newContent) return false;
        await fs.writeFile(file, newContent, 'utf8');
        return true;
    }

    private processReplacer(file: string, match: string, prefix: string, modulePath: string, suffix: string): string {
        const config = this.alias.find(c => c.isWildcard ? modulePath.startsWith(`${c.alias}/`) : modulePath === c.alias);
        if (!config) return match;

        const currentFileDir = path.dirname(file);
        let absoluteTarget: string;

        if (config.isWildcard) {
            const subPath = modulePath.length > config.alias.length 
                ? modulePath.substring(config.alias.length + 1) 
                : '';
            absoluteTarget = path.join(config.target, subPath);
        } else { absoluteTarget = config.target; }

        let relativeTarget = path.relative(currentFileDir, absoluteTarget);
        
        if (!relativeTarget.startsWith('.')) relativeTarget = `./${relativeTarget}`;
        const finalTarget = Utilities.Path.normalize(relativeTarget);

        return `${prefix}${finalTarget}${suffix}`;
    }

    public async watchHandler(queue: Map<string, NodeJS.Timeout>, eventType: string, filename: string): Promise<void> {
        if (!filename || !PathFixer.EXTENSIONS.some(ext => filename.endsWith(ext))) return;
        const fullPath = path.join(this.absoluteRoot, filename);
        if (queue.has(fullPath)) clearTimeout(queue.get(fullPath)!);
        queue.set(fullPath, setTimeout(() => this.watchTimeout(fullPath, filename), 300));
    }

    private async watchTimeout(file: string, name: string): Promise<void> {
        try {
            const stat = await fs.stat(file);
            if (!stat.isFile()) return;
            const changed = await this.process(file);
            if (changed) logger.log(`&C2File &C4${name}&C2 rewritten.`);
        } catch (error: any) {
            if (error.code !== 'ENOENT') logger.error(`Error processing &C4${name}&R:`, error);
        }
    }

    public static async getAllFiles(dir: string, extensions: string[]): Promise<string[]> {
        const result: string[] = [];
        const files = await fs.readdir(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                const allFiles = await PathFixer.getAllFiles(fullPath, extensions);
                result.push(...allFiles);
            } else if (extensions.some(ext => fullPath.endsWith(ext))) {
                result.push(fullPath);
            }
        }
        return result;
    }
}

export namespace PathFixer {
    export interface Paths { [alias: string]: string[]; }
    export interface Alias { alias: string; target: string; isWildcard: boolean; }
    export interface ProjectInfo {
        baseUrl?: string;
        rootDir?: string;
        outDir: string;
        paths: Paths;
    }
}

export default PathFixer;
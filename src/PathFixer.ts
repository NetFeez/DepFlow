/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility for path fixing.
 * @license Apache-2.0
 */
import path from 'path';
import syncFs, { promises as fs } from 'fs';
import { Logger, Utilities } from 'vortez';

const logger = new Logger({ prefix: 'PathFixer' });

export class PathFixer {
    public static readonly IMPORT_REGEX = /(from\s+['"])([^'"]+)(['"])/g;
    public static readonly DEFAULT_PROJECT_INFO: PathFixer.ProjectInfo = { root: 'src', out: 'build', path: {} }
    public static readonly PROJECT_ROOT = process.cwd();
    public static readonly EXTENSIONS = ['js', '.d.ts'];
    public absoluteRoot: string;
    public _alias: PathFixer.Alias[] | null = null;
    public constructor(
        public readonly info: PathFixer.ProjectInfo = PathFixer.DEFAULT_PROJECT_INFO,
        public readonly projectRoot: string = PathFixer.PROJECT_ROOT
    ) {
        const fullPath = path.join(projectRoot, info.out);
        this.absoluteRoot = path.resolve(fullPath);
    }
    public get alias(): PathFixer.Alias[] {
        if (this._alias) return this._alias;
        const result: PathFixer.Alias[] = [];
        for (const [key, value] of Object.entries(this.info.path)) {
            let alias = key.replace(/\/\*$/, '');
            // alias = alias.replace(new RegExp(`^${this.info.root}`), '');
            alias = alias.replace(/^\//, '');

            const root = this.info.root.replace(/^\.\//g, '');

            let target = value[0].replace(/(?:^\.\/)|(?:\/\*$)/g, '');
            console.log(target, this.info.root, this.absoluteRoot, this.projectRoot);
            target = target.replace(new RegExp(`^${this.info.root}`), '');
            target = target.replace(/^\/|\/$/g, '');
            target = path.resolve(this.absoluteRoot, target);
            console.log(alias, target);
            result.push({ alias, target });
        }
        this._alias = result;
        return result;
    }
    public async run(): Promise<void> {
        logger.log('&C2Starting path fixer, please wait...');
        if (!await Utilities.fileExists(this.absoluteRoot)) return void logger.warn(`The root directory &C4${this.absoluteRoot}&R does not exist.`);
        const files = await PathFixer.getAllFiles(this.absoluteRoot, PathFixer.EXTENSIONS);
        logger.log(`&C2Found &C3${files.length} &C2files to process in &C4${this.absoluteRoot}.`);
        let rewrittenCount = 0;
        for (const file of files) {
            const changed = await this.process(file);
            if (changed) rewrittenCount++;
        }
        logger.log(`&C2Path aliases rewritten in &C3${rewrittenCount} &C2files.`);
    }
    public async watch(): Promise<void> {
        await this.run();
        logger.log(`&C2Starting watcher in &C4${this.absoluteRoot}.`)
        if (!await Utilities.fileExists(this.absoluteRoot)) await fs.mkdir(this.absoluteRoot, { recursive: true });
        const watcher = syncFs.watch(this.absoluteRoot, { recursive: true });
        const queue = new Map<string, NodeJS.Timeout>();
        watcher.on('change', this.watchHandler.bind(this, queue));
    }
    private async process(file: string): Promise<boolean> {
        const content = await fs.readFile(file, 'utf8');
        const newContent = content.replace(PathFixer.IMPORT_REGEX, this.processReplacer.bind(this, file));
        if (content === newContent) return false;
        await fs.writeFile(file, newContent, 'utf8');
        return true;
    }
    private processReplacer(file: string, match: string, prefix: string, modulePath: string, suffix: string): string {
        const config = this.alias.find(config => modulePath.startsWith(`${config.alias}/`) || modulePath === config.alias);
        if (!config) return match;
        const dir = path.dirname(file);
        const restOfModulePath = modulePath.substring(config.alias.length);
        const absoluteTarget = path.join(config.target, restOfModulePath);
        let target = path.relative(dir, absoluteTarget);
        if (!target.startsWith('.')) target = `./${target}`;
        target = target.replace(/\\/g, '/');
        return `${prefix}${target}${suffix}`;
    }
    public async watchHandler(queue: Map<string, NodeJS.Timeout>, eventType: string, filename: string): Promise<void> {
        if (!filename || !PathFixer.EXTENSIONS.some(ext => filename.endsWith(ext))) return;
        const fullPath = path.join(this.absoluteRoot, filename);
        if (queue.has(fullPath)) clearTimeout(queue.get(fullPath));
        queue.set(fullPath, setTimeout(this.watchTimeout.bind(this, fullPath, filename), 300));
    }
    public async watchTimeout(file: string, name: string): Promise<void> {
        try {
            const stat = await fs.stat(file);
            if (!stat.isFile()) return;
            logger.log(`&C2Change detected in &C4${name}&C2. Processing`);
            const changed = await this.process(file);
            if (changed) logger.log(`&C2File &C4${name}&C2 rewritten.`);
        } catch (error: any) {
            if (error.code && error.code === 'ENOENT') {
                logger.warn(`File &C4${name}&R not found, it may have been deleted.`);
            } else {
                logger.error(`Error processing file &C4${name}&R:`, error);
            }
        }
    }
    public static async getAllFiles(dir: string, extensions: string[]): Promise<string[]> {
        const result: string[] = [];
        if (!await Utilities.fileExists(dir)) return result;
        const files = await fs.readdir(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                const stat = await fs.stat(fullPath);
                if (stat.isDirectory()) {
                    const subFiles = await this.getAllFiles(fullPath, extensions);
                    result.push(...subFiles);
                } else if (stat.isFile() && extensions.some(ext => fullPath.endsWith(ext))) {
                    result.push(fullPath);
                }
            } catch (error: any) {
                if (error && error.code === 'ENOENT') {
                    logger.warn(`File or directory &C4${fullPath}&R not found during scan, skipping.`);
                } else {
                    logger.error(`Error scanning file &C4${fullPath}&R:`, error);
                }
            }
        } return result;
    }
    public static async getProjectInfo(tsconfig: string = 'tsconfig.json'): Promise<PathFixer.ProjectInfo> {
        const info = PathFixer.DEFAULT_PROJECT_INFO;
        const content = await fs.readFile(tsconfig, 'utf8');
        const json = JSON.parse(content);
        if (!json.compilerOptions) return info;
        const options = json.compilerOptions;
        if (options.rootDir) info.root = options.rootDir;
        if (options.outDir) info.out = options.outDir;
        if (options.paths) info.path = options.paths;
        return info;
    }
}
namespace PathFixer {
    export interface Paths {
        [alias: string]: string[];
    }
    export interface Alias {
        alias: string;
        target: string;
    }
    export interface ProjectInfo {
        root: string;
        out: string;
        path: Paths;
    }
}
export default PathFixer;
import { Utilities } from "vortez";

import Validator from "../Validator.js";
import { Utils } from "../Utils.js";
import Config from "../Config.js";
import schemas from "../schemas.js";
import Dependency from "../Dependency.js";
import { Tsconfig } from "../Tsconfig.js";
import { PathFixer } from "../PathFixer.js";

export class DepFlowCLI extends Utilities.DebugUI {
    public constructor(
        public readonly configPath: string = 'depFlow.json'
    ) { super();
        this.addCommand('add', this.commandAdd, { usage: 'dep add <repo_url> [name]', description: 'Add a dependency to the configuration file.' });
        this.addCommand('remove', this.commandRemove, { usage: 'dep remove <name> | <repo_url>', description: 'Remove a dependency from the configuration file by name or repo URL.' });
        this.addCommand('install', this.commandInstall, { usage: 'dep install [name1 name2 ...]', description: 'Install dependencies. If names are provided, only those dependencies will be installed.' });
        this.addCommand('uninstall', this.uninstall, { usage: 'dep uninstall [name1 name2 ...]', description: 'Uninstall dependencies. If names are provided, only those dependencies will be uninstalled.' });
        this.addCommand('list', this.list, { usage: 'dep list', description: 'List all dependencies in the configuration file.' });
        this.addCommand('rewrite-paths', this.rewritePaths, { usage: 'dep rewrite-paths [--watch] [-p <tsconfig_path>]', description: 'Rewrite paths in tsconfig.json based on the dependencies. Use --watch to keep watching for changes.' });
    }
    public async commandAdd(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        this.out.info(`&C(255,180,220)│ Adding dependency...`);
        let [repo, name] = args;
        try {
            Validator.validateRepo(repo);
            if (!name) name = Utils.getRepoName(repo);
            const config = await Config.load(this.configPath);
            const dep = schemas.dependency.processData({ name, repo });
            config.dependencies.push(dep);
            await Config.save(this.configPath, config);
            this.out.info(`&C(255,180,220)│ Added dependency "${dep.name}".`);
        } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
    public async commandRemove(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        const [identifier] = args;
        try {
            if (!identifier) throw new Error('Usage: dep remove <name> | <repo_url>');
            const config = await Config.load(this.configPath);
            config.dependencies = config.dependencies.filter(dep => dep.name !== identifier && dep.repo !== identifier);
            await Config.save(this.configPath, config);
            this.out.info(`&C(255,180,220)│ Removed dependency "${identifier}".`);
        } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
    public async commandInstall(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        try {
            const config = await Config.load(this.configPath);
            const toInstall = args.length > 0
                ? config.dependencies.filter(dep => args.includes(dep.name) || args.includes(dep.repo))
                : config.dependencies;
            if (toInstall.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to install.');
            for (const dep of toInstall) {
                this.out.info(`&C(255,180,220)│ Installing "${dep.name}" from "${dep.repo}"...`);
                const dependency = new Dependency(dep);
                const result = await dependency.install();
                this.out.info(`&C(255,180,220)│ ${result.join('\n').replace(/\n/g, '\n&C(255,180,220)│ ')}`);
                this.out.info(`&C(255,180,220)│ &C3Installed dependency: &C3${dep.name}`);
                this.out.info(`&C(255,180,220)│ Installed "${dep.name}".`);
            }
        } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
    public async uninstall(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        try {
            const config = await Config.load(this.configPath);
            const toUninstall = args.length > 0
                ? config.dependencies.filter(dep => args.includes(dep.name) || args.includes(dep.repo))
                : config.dependencies;
            if (toUninstall.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to uninstall.');
            for (const dep of toUninstall) {
                this.out.info(`&C(255,180,220)│ Uninstalling "${dep.name}" from "${dep.repo}"...`);
                const dependency = new Dependency(dep);
                const result = await dependency.uninstall();
                this.out.info(`&C(255,180,220)│ ${result.join('\n').replace(/\n/g, '\n&C(255,180,220)│ ')}`);
                this.out.info(`&C(255,180,220)│ &C3Uninstalled dependency: &C3${dep.name}`);
                this.out.info(`&C(255,180,220)│ Uninstalled "${dep.name}".`);
            }
        } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
    public async list(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        try {
            const config = await Config.load(this.configPath);
            if (config.dependencies.length === 0) {
                this.out.info(`&C(255,180,220)│ No dependencies found.`);
            }
            for (const dep of config.dependencies) {
                this.out.info(`&C(255,180,220)│ &C3${dep.name} &C(255,180,220)from &C3${dep.repo}`);
            }
        } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
    public async rewritePaths(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        try {
            const config = await Config.load(this.configPath);
            const execPath = process.cwd();
            const watch = args.includes('--watch') || args.includes('-w');
            
            const projectPath = (
                Utils.getFlagValue(args, '-p', false)[0] ||
                Utils.getFlagValue(args, '--project', false)[0] ||
                config.tsconfig || config.webTsconfig ||
                Utilities.Path.join(execPath, 'tsconfig.json')
            );
            const tsconfig = await Tsconfig.load(projectPath);
            const options = tsconfig.compilerOptions;

            if (!options) throw new Error('tsconfig.json must have "compilerOptions" to rewrite paths.');
            if (!options.paths) throw new Error('tsconfig.json must have "paths" in compilerOptions to rewrite paths.');
            if (!options.outDir) throw new Error('tsconfig.json must have an "outDir" specified in compilerOptions to rewrite paths.');

            if (!options.baseUrl && !options.rootDir) {
                this.out.warn(`&C(255,180,220)│ &C3Warning: Neither "baseUrl" nor "rootDir" found. Resolving paths relative to project root.`);
            }

            const fixer = new PathFixer({
                paths: options.paths,
                baseUrl: options.baseUrl,
                rootDir: options.rootDir,
                outDir: options.outDir
            });

            if (watch) await fixer.watch();
            else await fixer.run();

        } catch (error: any) { this.out.error(`&C(255,180,220)│ &C1${error.message || error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
}
export namespace DepFlowCLI {}
export default DepFlowCLI;
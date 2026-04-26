import { Utilities } from "vortez";

import Validator from "../support/Validator.js";
import Utils from "../support/Utils.js";
import Config from "../config/Config.js";
import schemas from "../config/schemas.js";
import Dependency from "../support/Dependency.js";
import Tsconfig from "../config/Tsconfig.js";
import pathResolver, { PathResolver } from "../support/PathResolver.js";

export class DepFlowCLI extends Utilities.DebugUI {
    public constructor(
        public readonly configPath: string = 'depFlow.json'
    ) { super();
        this.addCommand('add', this.commandAdd, { usage: 'dep add <repo_url> [name]', description: 'Add a dependency to the configuration file.' });
        this.addCommand('remove', this.commandRemove, { usage: 'dep remove <name> | <repo_url>', description: 'Remove a dependency from the configuration file by name or repo URL.' });
        this.addCommand('install', this.commandInstall, { usage: 'dep install [name1 name2 ...]', description: 'Install dependencies. If names are provided, only those dependencies will be installed.' });
        this.addCommand('uninstall', this.uninstall, { usage: 'dep uninstall [name1 name2 ...]', description: 'Uninstall dependencies. If names are provided, only those dependencies will be uninstalled.' });
        this.addCommand('list', this.list, { usage: 'dep list', description: 'List all dependencies in the configuration file.' });
        this.addCommand('rewrite-paths', this.rewritePaths, { usage: 'dep rewrite-paths [--watch] [--cdn]', description: 'Resolve and rewrite paths in built files based on depFlow configuration.' });
        this.addCommand('sync', this.commandSync, { usage: 'dep sync', description: 'Syncs depFlow.json with tsconfig.json and generates the importmap.'  });


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
                const dependency = new Dependency(config, dep);
                const result = await dependency.install();
                this.out.info(`&C(255,180,220)│ ${result.join('\n').replace(/\n/g, '\n&C(255,180,220)│ ')}`);
                this.out.info(`&C(255,180,220)│ &C3Installed dependency: &C3${dep.name}`);
                this.out.info(`&C(255,180,220)│ Installed "${dep.name}".`);
            }
        } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
        this.commandSync('sync', []);
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
                const dependency = new Dependency(config, dep);
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
            const watch = args.includes('--watch') || args.includes('-w');
            const useCDN = args.includes('--cdn');
            const mode: PathResolver.Mode = useCDN ? 'cdn' : 'local';

            this.out.info(`&C(255,180,220)│ Mode: &C3${useCDN ? 'CDN' : 'Local'}`);
            if (watch) this.out.info(`&C(255,180,220)│ Watcher: &C2Enabled`);

            const resolver = new pathResolver(config);

            if (watch) await resolver.watch(mode);
            else await resolver.rewritePaths(mode);
        } catch (error: any) { this.out.error(`&C(255,180,220)│ &C1${error.message || error}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
    public async commandSync(command: string, args: string[]) {
        this.out.info(`&C(255,180,220)╭──────────────────────────────────────────────────`);
        this.out.info(`&C(255,180,220)│ Synchronizing configurations...`);
        try {
            const useCDN = args.includes('--cdn');
            const mode: pathResolver.Mode = useCDN ? 'cdn' : 'local';

            const config = await Config.load(this.configPath);
            const resolver = new pathResolver(config, { logger: this.out });

            await resolver.syncTsConfig();
            await resolver.syncImportMap(mode);

            this.out.info(`&C(255,180,220)│ &C2Successfully synced all configurations.`);
        } catch (error: any) { this.out.error(`&C(255,180,220)│ &C1Error during sync: ${error.message}`); }
        finally { this.out.info(`&C(255,180,220)╰──────────────────────────────────────────────────`); }
    }
}
export namespace DepFlowCLI {}
export default DepFlowCLI;
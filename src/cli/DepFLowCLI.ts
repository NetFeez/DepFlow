import path from "node:path";

import Logger, { DebugUI } from "@netfeez/vterm";

import Utils from "../support/Utils.js";
import Validator from "../support/Validator.js";
import GitDependency from "../support/Dependency/GitDependency.js";
import PathResolver from "../support/PathResolver/PathResolver.js";
import Config from "../config/Config.js";
import Schemas from "../config/schemas.js";
import Tsconfig from "../config/Tsconfig.js";
import ImportMap from "../config/ImportMap.js";
import NpmDependency from "../support/Dependency/NpmDependency.js";
import Builder from "../support/Builder/Builder.js";

export class DepFlowCLI extends DebugUI {
    protected readonly projectRoot: string;
    public constructor(
        public readonly configPath: string = 'depFlow.json'
    ) { super();
        this.out = new Logger({
            logger: this.out,
            formatter: { maxMessageLength: 100 }
        })

        const absoluteConfigPath = path.resolve(process.cwd(), this.configPath);
        this.projectRoot = path.dirname(absoluteConfigPath);

        this.addCommand('add', this.commandAdd, { usage: 'dep add <repo_url> [name]', description: 'Add a dependency to the configuration file.' });
        this.addCommand('remove', this.commandRemove, { usage: 'dep remove <name> | <repo_url>', description: 'Remove a dependency from the configuration file by name or repo URL.' });
        this.addCommand('install', this.commandInstall, { usage: 'dep install [name1 name2 ...]', description: 'Install dependencies. If names are provided, only those dependencies will be installed.' });
        this.addCommand('uninstall', this.uninstall, { usage: 'dep uninstall [name1 name2 ...]', description: 'Uninstall dependencies. If names are provided, only those dependencies will be uninstalled.' });
        this.addCommand('run', this.commandRun, { usage: 'dep run <script>', description: 'Run a custom action defined in the configuration file.' });
        this.addCommand('list', this.list, { usage: 'dep list', description: 'List all dependencies in the configuration file.' });
        this.addCommand('rewrite-paths', this.rewritePaths, { usage: 'dep rewrite-paths [--watch] [--cdn]', description: 'Resolve and rewrite paths in built files based on depFlow configuration.' });
        this.addCommand('sync', this.commandSync, { usage: 'dep sync', description: 'Syncs depFlow.json with tsconfig.json and generates the importmap.'  });
    }
    public async commandAdd(command: string, args: string[]) {
        try {
            let [repo, name] = args;

            this.out.group(Utils.newGroup('#FFB4DC'));
            this.out.info(`Adding dependency...`);

            Validator.validateRepo(repo);
            if (!name) name = Utils.getRepoName(repo);

            const dep = Schemas.GitDependency.processData({ name, repo });

            const config = await Config.load(this.configPath);
            config.dependencies.push(dep);
            await Config.save(this.configPath, config);

            this.out.info(`Added dependency "${dep.name}".`);
        } catch (error) { this.out.error(`&C1${error}`); }
        finally { this.out.groupEnd(); }
    }
    public async commandRemove(command: string, args: string[]) {
        try {
            const [ identifier ] = args;

            this.out.group(Utils.newGroup('#FFB4DC'));            
            if (!identifier) throw new Error('Usage: dep remove <name> | <repo_url>');

            const config = await Config.load(this.configPath);
            config.dependencies = config.dependencies.filter(dep => dep.name !== identifier && dep.repo !== identifier);
            await Config.save(this.configPath, config);

            this.out.info(`Removed dependency "${identifier}".`);
        } catch (error) { this.out.error(`&C1${error}`); }
        finally { this.out.groupEnd(); }
    }
    public async commandInstall(command: string, args: string[]) {
        try {
            this.out.group(Utils.newGroup('#FFB4DC'));

            const config = await Config.load(this.configPath);
            const gitDependencies = config.dependencies;

            if (gitDependencies.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to install.');

            this.out.info(`&C5Installing dependencies...`);
            for (const dep of gitDependencies) {
                try {
                    this.out.group(Utils.newGroup('#FFB4DC'));
                    this.out.info(`&C5Installing &C6"${dep.name}" &C5from &C6${dep.repo}&C5...`);
                    this.out.line();

                    const dependency = new GitDependency(config.flowFolder, dep, this.out);
                    await dependency.install();

                    this.out.line();
                    this.out.info(`&C2Installed &C6${dep.name}.`);
                } finally { this.out.groupEnd(); }
            }

            const npmDependencies = config.npmDependencies;
            for (const dep of npmDependencies) {
                try {
                    this.out.group(Utils.newGroup('#FFB4DC'));
                    this.out.info(`&C5Installing npm dependency &C6"${dep.name}" &C5version &C6${dep.version}&C5...`);
                    this.out.line();

                    const dependency = new NpmDependency(config.flowFolder, dep, this.out);
                    await dependency.install();

                    this.out.line();
                    this.out.info(`&C2Installed npm dependency &C6${dep.name}.`);
                } finally { this.out.groupEnd(); }
            }

            await this.commandSync('sync', []);
        } catch (error) { this.out.error(`&C1${error}`); }
        finally { this.out.groupEnd(); }
    }
    public async uninstall(command: string, args: string[]) {
        try {
            this.out.group(Utils.newGroup('#FFB4DC'));

            const config = await Config.load(this.configPath);
            const dependencies = config.dependencies;

            if (dependencies.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to uninstall.');

            for (const dep of dependencies) {
                try {
                    this.out.group(Utils.newGroup('#FFB4DC'));
                    this.out.info(`&C1Uninstalling "${dep.name}" from "${dep.repo}"...`);
                    this.out.line();
                    const dependency = new GitDependency(config.flowFolder, dep, this.out);
                    await dependency.uninstall();
                    this.out.line();
                    this.out.info(`Uninstalled "${dep.name}".`);
                    this.out.groupEnd();
                } finally { this.out.groupEnd(); }
            }
        } catch (error) { this.out.error(`&C1${error}`); }
        finally { this.out.groupEnd(); }
    }
    public async commandRun(command: string, args: string[]) {
        try {
            const [actionName] = args;
            if (!actionName) throw new Error('Usage: dep run <action>');

            this.out.group(Utils.newGroup('#FFB4DC'));
            this.out.info(`&C5Running action &C6${actionName}&C5...`);

            const config = await Config.load(this.configPath);
            const action = config.actions[actionName];
            if (!action) throw new Error(`action "${actionName}" not found in configuration.`);

            const pipeline = Array.isArray(action) ? action : [action];

            const builder = new Builder({
                cwd: this.projectRoot,
                pipeline,
                logger: this.out
            });
            await builder.run();
        } catch (error) { this.out.error(`&C1${error}`); }
        finally { this.out.groupEnd(); }
    }
    public async list(command: string, args: string[]) {
        this.out.group(Utils.newGroup('#FFB4DC'));
        try {
            const config = await Config.load(this.configPath);
            if (config.dependencies.length === 0) {
                this.out.info(`No dependencies found.`);
            }
            for (const dep of config.dependencies) {
                this.out.info(`&C6${dep.name} &C7from &C2${dep.repo}`);
            }
        } catch (error) { this.out.error(`&C1${error}`); }
        finally { this.out.groupEnd(); }
    }
    public async rewritePaths(command: string, args: string[]) {
        this.out.group(Utils.newGroup('#FFB4DC'));
        try {
            const config = await Config.load(this.configPath);
            const watch = args.includes('--watch') || args.includes('-w');
            const useCDN = args.includes('--cdn');
            const mode: PathResolver.Mode = useCDN ? 'cdn' : 'local';

            this.out.info(`Mode: &C3${useCDN ? 'CDN' : 'Local'}`);
            if (watch) this.out.info(`Watcher: &C2Enabled`);

            const resolver = new PathResolver(config, { logger: this.out });

            if (watch) await resolver.watch(mode);
            else await resolver.rewritePaths(mode);
        } catch (error: any) { this.out.error(`&C1${error.message || error}`); }
        finally { this.out.groupEnd(); }
    }
    public async commandSync(command: string, args: string[]) {
        try {
            this.out.group(Utils.newGroup('#FFB4DC'));
            this.out.info(`Synchronizing configurations...`);

            const useCDN = args.includes('--cdn');
            const mode: PathResolver.Mode = useCDN ? 'cdn' : 'local';
            
            
            const config = await Config.load(this.configPath);
            const resolver = new PathResolver(config, { logger: this.out });
            
            const tsconfigFile = config.tsconfig;
            const importMapFile = config.importmap;
            
            if (tsconfigFile) {
                const tsconfig = await Tsconfig.load(this.projectRoot, tsconfigFile, { logger: this.out });
                tsconfig.updatePaths(resolver.aliases);
                await tsconfig.save();
            } else this.out.warn(`No tsconfig file specified in configuration. Skipping tsconfig synchronization.`);
            if (importMapFile) {
                const importmap = await ImportMap.load(this.projectRoot, importMapFile, { logger: this.out });
                importmap.updateImports(resolver.aliases, mode);
                await importmap.save();
            } else this.out.warn(`No import map file specified in configuration. Skipping import map synchronization.`);

            this.out.info(`&C2Successfully synced all configurations.`);
        } catch (error) { this.out.error(`&C1Error during sync: ${error}`); }
        finally { this.out.groupEnd(); }
    }
}
export namespace DepFlowCLI {}
export default DepFlowCLI;
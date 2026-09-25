import path from "node:path";

import Logger, { DebugUI } from "@netfeez/vterm";

import { newGroup } from "../task/Group.js";
import { getRepoName } from "../dependency/RepoName.js";
import type Flags from "./Flags.js";
import Validator from "../dependency/Validator.js";
import GitDependency from "../dependency/GitDependency.js";
import PathResolver from "../resolve/PathResolver.js";
import Config from "../config/Config.js";
import schema from "../schema/schema.js";
import TSConfig from "../config/TSConfig.js";
import ImportMap from "../config/ImportMap.js";
import NpmDependency from "../dependency/NpmDependency.js";
import Builder from "../builder/Builder.js";
import { Path } from "@netfeez/common-node";

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
        this.addCommand('json-to-yaml', this.convert, { usage: 'dep json-to-yaml [output.yaml]', description: 'Convert the depflow config file from JSON to YAML.' });
        this.addCommand('yaml-to-json', this.convert, { usage: 'dep yaml-to-json [output.json]', description: 'Convert the depflow config file from YAML to JSON.' });
    }
    public async commandAdd(command: string, args: string[]) {
        try {
            let [repo, name] = args;

            this.out.group(newGroup('#FFB4DC'));
            this.out.info(`Adding dependency...`);

            Validator.validateRepo(repo);
            if (!name) name = getRepoName(repo);

            const dep = schema.Dependency.GitDependency.process({ name, repo });

            const config = await Config.load(this.configPath);
            config.data.dependencies.push(dep);
            await config.save();

            this.out.info(`Added dependency "${dep.name}".`);
        } finally { this.out.groupEnd(); }
    }
    public async commandRemove(command: string, args: string[]) {
        try {
            const [ identifier ] = args;

            this.out.group(newGroup('#FFB4DC'));            
            if (!identifier) throw new Error('Usage: dep remove <name> | <repo_url>');

            const config = await Config.load(this.configPath);
            config.data.dependencies = config.data.dependencies.filter(dep => dep.name !== identifier && dep.repo !== identifier);
            await config.save();

            this.out.info(`Removed dependency "${identifier}".`);
        } finally { this.out.groupEnd(); }
    }
    public async commandInstall(command: string, args: string[]) {
        try {
            this.out.group(newGroup('#FFB4DC'));

            const config = await Config.load(this.configPath);
            const gitDependencies = config.data.dependencies;

            if (gitDependencies.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to install.');

            this.out.info(`&C5Installing dependencies...`);
            for (const dep of gitDependencies) {
                try {
                    this.out.group(newGroup('#FFB4DC'));
                    this.out.info(`&C5Installing &C6"${dep.name}" &C5from &C6${dep.repo}&C5...`);
                    this.out.line();

                    const dependency = new GitDependency(config.data.flowFolder, dep, this.out);
                    await dependency.install();

                    this.out.line();
                    this.out.info(`&C2Installed &C6${dep.name}.`);
                } finally { this.out.groupEnd(); }
            }

            const npmDependencies = config.data.npmDependencies;
            for (const dep of npmDependencies) {
                try {
                    this.out.group(newGroup('#FFB4DC'));
                    this.out.info(`&C5Installing npm dependency &C6"${dep.name}" &C5version &C6${dep.version}&C5...`);
                    this.out.line();

                    const dependency = new NpmDependency(config.data.flowFolder, dep, this.out);
                    await dependency.install();

                    this.out.line();
                    this.out.info(`&C2Installed npm dependency &C6${dep.name}.`);
                } finally { this.out.groupEnd(); }
            }

            await this.commandSync('sync', []);
        } finally { this.out.groupEnd(); }
    }
    public async uninstall(command: string, args: string[]) {
        try {
            this.out.group(newGroup('#FFB4DC'));

            const config = await Config.load(this.configPath);
            const dependencies = config.data.dependencies;

            if (dependencies.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to uninstall.');

            for (const dep of dependencies) {
                try {
                    this.out.group(newGroup('#FFB4DC'));
                    this.out.info(`&C1Uninstalling "${dep.name}" from "${dep.repo}"...`);
                    this.out.line();
                    const dependency = new GitDependency(config.data.flowFolder, dep, this.out);
                    await dependency.uninstall();
                    this.out.line();
                    this.out.info(`Uninstalled "${dep.name}".`);
                    this.out.groupEnd();
                } finally { this.out.groupEnd(); }
            }
        } finally { this.out.groupEnd(); }
    }
    public async commandRun(command: string, args: string[]) {
        try {
            const [actionName] = args;
            if (!actionName) throw new Error('Usage: dep run <action>');

            this.out.group(newGroup('#FFB4DC'));
            this.out.info(`&C5Running action &C6${actionName}&C5...`);

            const config = await Config.load(this.configPath);
            const action = config.data.actions[actionName];
            if (!action) throw new Error(`action "${actionName}" not found in configuration.`);

            const pipeline = Array.isArray(action) ? action : [action];

            const builder = new Builder({
                cwd: this.projectRoot,
                pipeline,
                logger: this.out
            });
            await builder.run();
        } finally { this.out.groupEnd(); }
    }
    public async list(command: string, args: string[]) {
        this.out.group(newGroup('#FFB4DC'));
        try {
            const config = await Config.load(this.configPath);
            if (config.data.dependencies.length === 0) {
                this.out.info(`No dependencies found.`);
            }
            for (const dep of config.data.dependencies) {
                this.out.info(`&C6${dep.name} &C7from &C2${dep.repo}`);
            }
        } finally { this.out.groupEnd(); }
    }
    public async rewritePaths(command: string, args: string[], flags: Flags.FlagMap = {}) {
        this.out.group(newGroup('#FFB4DC'));
        try {
            const config = await Config.load(this.configPath);
            const watch = flags['--watch'] !== undefined || flags['-w'] !== undefined;
            const useCDN = flags['--cdn'] !== undefined;
            const mode: PathResolver.Mode = useCDN ? 'cdn' : 'local';

            this.out.info(`Mode: &C3${useCDN ? 'CDN' : 'Local'}`);
            if (watch) this.out.info(`Watcher: &C2Enabled`);

            const resolver = new PathResolver(config.data, this.projectRoot, { logger: this.out });

            if (watch) await resolver.watch(mode);
            else await resolver.rewritePaths(mode);
        } finally { this.out.groupEnd(); }
    }
    public async commandSync(command: string, args: string[], flags: Flags.FlagMap = {}) {
        try {
            this.out.group(newGroup('#FFB4DC'));
            this.out.info(`Synchronizing configurations...`);

            const useCDN = flags['--cdn'] !== undefined;
            const mode: PathResolver.Mode = useCDN ? 'cdn' : 'local';
            
            
            const config = await Config.load(this.configPath);
            const resolver = new PathResolver(config.data, this.projectRoot, { logger: this.out });
            
            const tsconfigFile = config.data.tsconfig;
            const importMapFile = config.data.importmap;
            const tsconfigPath = path.join(this.projectRoot, tsconfigFile || 'tsconfig.json');
            const importMapPath = path.join(this.projectRoot, importMapFile || 'importmap.json');

            if (tsconfigFile) {
                const tsconfig = await TSConfig.load(tsconfigPath, { logger: this.out });
                tsconfig.updatePaths(resolver.aliases);
                await tsconfig.save();
            } else this.out.warn(`No tsconfig file specified in configuration. Skipping tsconfig synchronization.`);
            if (importMapFile) {
                const importmap = await ImportMap.load(importMapPath, { logger: this.out });
                importmap.updateImports(resolver.aliases, mode);
                await importmap.save();
            } else this.out.warn(`No import map file specified in configuration. Skipping import map synchronization.`);

            this.out.info(`&C2Successfully synced all configurations.`);
        } finally { this.out.groupEnd(); }
    }
    /**
     * Converts the depflow config file between JSON and YAML.
     * @param command - The invoked command name ('json-to-yaml' or 'yaml-to-json').
     * @param args - Optional output file path.
     */
    public async convert(command: string, args: string[]) {
        try {
            this.out.group(newGroup('#FFB4DC'));

            const to = command === 'json-to-yaml' ? 'yaml' : 'json';
            const input = this.configPath;
            const inputExt = Path.extName(input).toLowerCase();
            const isJsonInput = inputExt === '.json';
            const isYamlInput = inputExt === '.yaml' || inputExt === '.yml';
            if (!isJsonInput && !isYamlInput) throw new Error(`Unsupported config file extension: ${inputExt}`);
            if (isYamlInput === (to === 'yaml')) throw new Error(`Config file is already ${to}: ${input}`);

            const config = await Config.load(input);
            const [output] = args;
            const outPath = output || path.join(this.projectRoot, `${Path.fileName(input, false)}.${to}`);
            await config.save(outPath);

            this.out.info(`&C2Converted &C4${Path.fileName(input)} &C7→&R &C4${Path.fileName(outPath)} &C2(&C3${to.toUpperCase()}&C2).`);
        } finally { this.out.groupEnd(); }
    }
}
export namespace DepFlowCLI {
    export type Exec = (this: DepFlowCLI, command: string, args: string[], flags: Flags.FlagMap) => Promise<void> | void;
}
export default DepFlowCLI;
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Main CLI surface: dependency management commands, builds and config conversions.
 * @license Apache-2.0
 */

import { Logger } from "@netfeez/vterm";
import { Path } from "@netfeez/common-node";

import CLI from "./CLI.js";
import Group from "../task/Group.js";
import OutputPolicy from "../task/OutputPolicy.js";
import DepUtils from "../dependency/DepUtils.js";
import GitDependency from "../dependency/GitDependency.js";
import PathResolver from "../resolve/PathResolver.js";
import Config from "../config/Config.js";
import schema from "../schema/schema.js";
import TSConfig from "../config/TSConfig.js";
import ImportMap from "../config/ImportMap.js";
import NpmDependency from "../dependency/NpmDependency.js";
import Builder from "../builder/Builder.js";
import Flags from "./Flags.js";

/** The flags accepted by every command of the CLI. **/
export const options = new Flags({
    flow: {
        type: 'string',
        default: 'depflow.yml',
        aliases: ['p', 'f'],
        description: 'Path to the configuration file the command operates on.'
    },
    watch: {
        type: 'boolean',
        default: false,
        aliases: ['w'],
        description: 'Keeps watching the built files and rewrites their paths on every change.'
    },
    cdn: {
        type: 'boolean',
        default: false,
        description: 'Resolves the dependency paths to their CDN target instead of their local one.'
    },
    verbose: {
        type: 'boolean',
        default: false,
        aliases: ['v'],
        description: 'Streams the output of every command as it runs, attributed to the command that wrote it, instead of only reporting how each of them ended. The indentation of that output is lost, and the complete buffer of every command reaches the evidence file whether this flag is given or not.'
    },
    silent: {
        type: 'boolean',
        default: false,
        description: 'Says only what failed, one line per failed command. It silences the progress of DepFlow itself, such as "Installing dependencies...", and not the help, which belongs to the console interface. The exit status and the evidence file are the same as in any other mode.'
    },
    decorate: {
        type: 'boolean',
        default: true,
        description: 'Draws boxes, indentation, timestamps, levels and names around what is reported. --decorate=false leaves the content alone and keeps the color of the markers and the diagnostics, which carry information and are not decoration.'
    }
});

export class DepFlowCLI extends CLI {
    protected readonly projectRoot: string;

    public constructor(
        public readonly configPath: string = 'depFlow.yml'
    ) { super(options.declaration, {
        name: 'C-UI',
        title: '&C1DepFlow &C5CLI &C6by NetFeez',
        prompt: '&C5[DepFlow] << &C6&S'
    });

        const absoluteConfigPath = Path.resolve(process.cwd(), this.configPath);
        this.projectRoot = Path.dirname(absoluteConfigPath);

        this.addCommand('add', this.commandAdd, {
            usage: 'dep add <repo_url> [name]',
            description: 'Add a dependency to the configuration file.',
            args: {
                repo_url: { description: 'URL of the git repository to add.' },
                name: { description: 'Name to register the dependency under; derived from the repository URL when it is omitted.', required: false }
            }
        });
        this.addCommand('remove', this.commandRemove, {
            usage: 'dep remove <name> | <repo_url>',
            description: 'Remove a dependency from the configuration file and uninstall its files.',
            args: {
                identifier: { description: 'Name or repository URL of the dependency to remove.' }
            }
        });
        this.addCommand('install', this.commandInstall, {
            usage: 'dep install [name1 name2 ...]',
            description: 'Install dependencies. If names are provided, only those dependencies will be installed.',
            args: {
                names: { description: 'Names of the dependencies to install; every dependency when none is given.', required: false, variadic: true }
            }
        });
        this.addCommand('run', this.commandRun, {
            usage: 'dep run <script>',
            description: 'Run a custom action defined in the configuration file.',
            args: {
                script: { description: 'Name of the action declared in the configuration file.' }
            }
        });
        this.addCommand('list', this.list, { usage: 'dep list', description: 'List all dependencies in the configuration file.' });
        this.addCommand('rewrite-paths', this.rewritePaths, { usage: 'dep rewrite-paths [--watch] [--cdn]', description: 'Rewrite the paths of the built files of outDir according to the resolver entries of the configuration.' });
        this.addCommand('sync', this.commandSync, { usage: 'dep sync', description: 'Write the resolver entries into the paths of the declared tsconfig and into the declared importmap.'  });
        this.addCommand('json-to-yaml', this.convert, {
            usage: 'dep json-to-yaml [output.yaml]',
            description: 'Convert the depflow config file from JSON to YAML.',
            args: {
                output: { description: 'Path of the YAML file to write; derived from the config file name when it is omitted.', required: false }
            }
        });
        this.addCommand('yaml-to-json', this.convert, {
            usage: 'dep yaml-to-json [output.json]',
            description: 'Convert the depflow config file from YAML to JSON.',
            args: {
                output: { description: 'Path of the JSON file to write; derived from the config file name when it is omitted.', required: false }
            }
        });
    }
    /** Absolute path of the flow directory (`.depflow`) under the project root. **/
    protected get flowDirectory(): string { return Path.join(this.projectRoot, '.depflow'); }

    /**
     * The policy the run is presented through, built for the mode the flags asked for.
     * @param flags - The flags of the command being run.
     * @returns The policy of the run, never `null`: the evidence is written whether it is asked for or not.
     *
     * @remarks The policy is also what settles the channel the lifecycle of the CLI is reported through, so
     * every command asks for it first and reports through `policy.report`: a `silent` run that said
     * "Installing dependencies..." would not be silent, and an undecorated run would still draw boxes
     * around lines that carry nothing but what they say.
     *
     * @remarks A command reports through the policy and not through `this.out`, which belongs to the
     * console interface DepFlow was built on: the help, the prompt and the verdict of an invocation are
     * drawn by surfaces DepFlow does not own, and they stay visible in every mode.
     *
     * @example
     * ```ts
     * const policy = this.policy(flags);
     * const out = policy.report;
     * if (policy.decoration === 'on') out.group(Group.create('#FFB4DC'));
     * ```
     */
    protected policy(flags: DepFlowCLI.Options): OutputPolicy {
        return new OutputPolicy({
            logger: new Logger({ name: 'depflow', save: true }),
            name: 'depflow',
            verbose: flags.verbose,
            silent: flags.silent,
            decorate: flags.decorate
        });
    }

    public async commandAdd(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            let [repo, name] = args;

            out.info(`Adding dependency...`);

            DepUtils.repo(repo);
            if (!name) name = DepUtils.getRepoName(repo);

            const dep = schema.Dependency.GitDependency.process({ name, repo });

            const config = await Config.load(this.configPath);
            const taken = config.data.dependencies.some(existing => existing.name === dep.name);
            if (taken) throw new Error(`A dependency named "${dep.name}" already exists, remove it first or add this one with another name.`);
            config.data.dependencies.push(dep);
            await config.save();

            out.info(`Added dependency "${dep.name}".`);
        } finally { if (boxed) out.end(); }
    }
    public async commandRemove(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            const [ identifier ] = args;
            if (!identifier) throw new Error('Usage: dep remove <name> | <repo_url>');

            const config = await Config.load(this.configPath);
            const gitMatches = config.data.dependencies.filter(dep => dep.name === identifier || dep.repo === identifier);
            const npmMatches = config.data.npmDependencies.filter(dep => dep.name === identifier);
            if (gitMatches.length + npmMatches.length === 0) throw new Error(`Dependency "${identifier}" not found.`);

            for (const dep of gitMatches) await new GitDependency(this.flowDirectory, this.projectRoot, dep, out).uninstall();
            for (const dep of npmMatches) await new NpmDependency(this.flowDirectory, this.projectRoot, dep, out).uninstall();

            config.data.dependencies = config.data.dependencies.filter(dep => dep.name !== identifier && dep.repo !== identifier);
            config.data.npmDependencies = config.data.npmDependencies.filter(dep => dep.name !== identifier);
            await config.save();

            out.info(`Removed dependency "${identifier}".`);
        } finally { if (boxed) out.end(); }
    }
    public async commandInstall(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));

            const config = await Config.load(this.configPath);
            const gitDependencies = config.data.dependencies;
            const npmDependencies = config.data.npmDependencies;

            if (gitDependencies.length + npmDependencies.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to install.');

            const names = new Set(args);
            const gitTargets = args.length > 0 ? gitDependencies.filter(dep => names.has(dep.name)) : gitDependencies;
            const npmTargets = args.length > 0 ? npmDependencies.filter(dep => names.has(dep.name)) : npmDependencies;
            if (args.length > 0 && gitTargets.length + npmTargets.length === 0) throw new Error('Specified dependencies not found.');

            out.info(`&C5Installing dependencies...`);
            for (const dep of gitTargets) {
                try {
                    if (boxed) out.group(Group.create('#FFB4DC'));
                    out.info(`&C5Installing &C6"${dep.name}" &C5from &C6${dep.repo}&C5...`);
                    out.line();

                    const dependency = new GitDependency(this.flowDirectory, this.projectRoot, dep, out, policy);
                    await dependency.install();

                    out.line();
                    out.info(`&C2Installed &C6${dep.name}.`);
                } finally { if (boxed) out.end(); }
            }

            for (const dep of npmTargets) {
                try {
                    if (boxed) out.group(Group.create('#FFB4DC'));
                    out.info(`&C5Installing npm dependency &C6"${dep.name}" &C5version &C6${dep.version}&C5...`);
                    out.line();

                    const dependency = new NpmDependency(this.flowDirectory, this.projectRoot, dep, out, policy);
                    await dependency.install();

                    out.line();
                    out.info(`&C2Installed npm dependency &C6${dep.name}.`);
                } finally { if (boxed) out.end(); }
            }

            await this.commandSync('sync', [], flags, policy);
        } finally { if (boxed) out.end(); }
    }
    public async commandRun(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            const [actionName] = args;
            if (!actionName) throw new Error('Usage: dep run <action>');

            if (boxed) out.group(Group.create('#FFB4DC'));
            out.info(`&C5Running action &C6${actionName}&C5...`);

            const config = await Config.load(this.configPath);
            const action = config.data.actions[actionName];
            if (!action) throw new Error(`action "${actionName}" not found in configuration.`);

            const pipeline = Array.isArray(action) ? action : [action];

            const builder = new Builder({
                cwd: this.projectRoot,
                projectRoot: this.projectRoot,
                pipeline,
                logger: out,
                policy
            });
            await builder.run();
        } finally { if (boxed) out.end(); }
    }
    public async list(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        if (boxed) out.group(Group.create('#FFB4DC'));
        try {
            const config = await Config.load(this.configPath);
            if (config.data.dependencies.length + config.data.npmDependencies.length === 0) {
                out.info(`No dependencies found.`);
            }
            for (const dep of config.data.dependencies) {
                const state = await new GitDependency(this.flowDirectory, this.projectRoot, dep).isInstalled()
                    ? `&C2installed&R` : `&C3missing&R`;
                out.info(`&C6${dep.name} &C7from &C2${dep.repo} &C7(${state}&C7)`);
            }
            for (const dep of config.data.npmDependencies) {
                const state = await new NpmDependency(this.flowDirectory, this.projectRoot, dep).isInstalled()
                    ? `&C2installed&R` : `&C3missing&R`;
                out.info(`&C6${dep.name} &C7v&C2${dep.version} &C7(${state}&C7)`);
            }
        } finally { if (boxed) out.end(); }
    }
    public async rewritePaths(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        if (boxed) out.group(Group.create('#FFB4DC'));
        try {
            const { watch, cdn } = flags;
            const config = await Config.load(this.configPath);
            const mode: PathResolver.Mode = cdn ? 'cdn' : 'local';

            out.info(`Mode: &C3${cdn ? 'CDN' : 'Local'}`);
            if (watch) out.info(`Watcher: &C2Enabled`);

            const resolver = new PathResolver(config.data, this.projectRoot, { logger: out });

            if (watch) await resolver.watch(mode);
            else await resolver.rewritePaths(mode);
        } finally { if (boxed) out.end(); }
    }
    public async commandSync(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults, caller: OutputPolicy = this.policy(flags)) {
        const policy = caller;
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            out.info(`Synchronizing configurations...`);

            const { cdn } = flags;
            const mode: PathResolver.Mode = cdn ? 'cdn' : 'local';

            const config = await Config.load(this.configPath);
            const resolver = new PathResolver(config.data, this.projectRoot, { logger: out });

            const tsconfigFile = config.data.tsconfig;
            const importMapFile = config.data.importmap;
            const tsconfigPath = Path.join(this.projectRoot, tsconfigFile || 'tsconfig.json');
            const importMapPath = Path.join(this.projectRoot, importMapFile || 'importmap.json');

            if (tsconfigFile) {
                const tsconfig = await TSConfig.load(tsconfigPath, { logger: out });
                tsconfig.updatePaths(resolver.aliases);
                await tsconfig.save();
            } else out.warn(`No tsconfig file specified in configuration. Skipping tsconfig synchronization.`);
            if (importMapFile) {
                const importmap = await ImportMap.load(importMapPath, { logger: out });
                importmap.updateImports(resolver.aliases, mode);
                await importmap.save();
            } else out.warn(`No import map file specified in configuration. Skipping import map synchronization.`);

            out.info(`&C2Successfully synced all configurations.`);
        } finally { if (boxed) out.end(); }
    }
    /**
     * Converts the depflow config file between JSON and YAML.
     * @param command - The invoked command name ('json-to-yaml' or 'yaml-to-json').
     * @param args - Optional output file path.
     * @param flags - The flags of the command being run, which settle how the conversion is reported.
     */
    public async convert(command: string, args: string[], flags: DepFlowCLI.Options = options.defaults) {
        const policy = this.policy(flags);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));

            const to = command === 'json-to-yaml' ? 'yaml' : 'json';
            const input = this.configPath;
            const inputExt = Path.extName(input).toLowerCase();
            const isJsonInput = inputExt === '.json';
            const isYamlInput = inputExt === '.yaml' || inputExt === '.yml';
            if (!isJsonInput && !isYamlInput) throw new Error(`Unsupported config file extension: ${inputExt}`);
            if (isYamlInput === (to === 'yaml')) throw new Error(`Config file is already ${to}: ${input}`);

            const config = await Config.load(input);
            const [output] = args;
            const outPath = output || Path.join(this.projectRoot, `${Path.fileName(input, false)}.${to}`);
            await config.save(outPath);

            out.info(`&C2Converted &C4${Path.fileName(input)} &C7→&R &C4${Path.fileName(outPath)} &C2(&C3${to.toUpperCase()}&C2).`);
        } finally { if (boxed) out.end(); }
    }
}
export namespace DepFlowCLI {
    export type Exec = (this: DepFlowCLI, command: string, args: string[], flags: Options) => Promise<void> | void;

    /** The values of the flags accepted by the CLI. **/
    export type Options = typeof options.infer;
}
export default DepFlowCLI;
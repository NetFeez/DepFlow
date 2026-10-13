/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description The operations of DepFlow, detached from the console that invokes them: every action runs
 *              against an explicit project context, so it can be driven by the CLI or by a tool built on it.
 * @license Apache-2.0
 */

import { Logger } from '@netfeez/vterm';
import { Path } from '@netfeez/common-node';

import Group from '../task/Group.js';
import OutputPolicy from '../task/OutputPolicy.js';
import DepUtils from '../dependency/DepUtils.js';
import GitDependency from '../dependency/GitDependency.js';
import NpmDependency from '../dependency/NpmDependency.js';
import PathResolver from '../resolve/PathResolver.js';
import Config from '../config/Config.js';
import schema from '../schema/schema.js';
import TSConfig from '../config/TSConfig.js';
import ImportMap from '../config/ImportMap.js';
import Builder from '../builder/Builder.js';

export namespace Actions {
    /**
     * The project an action operates on.
     *
     * @remarks The context is explicit on purpose: an action does not reach back into the console that
     * invoked it, so the same function runs from the CLI and from any tool built on depflow, and the
     * paths it depends on are visible where it is called rather than hidden in an instance.
     */
    export interface Context {
        /** Path of the configuration file, as the command was given it. */
        configPath: string;

        /** Absolute path of the directory holding the configuration file, the project root. */
        projectRoot: string;

        /** Absolute path of the flow folder `.depflow`, where dependencies are materialized. */
        flowDirectory: string;
    }

    /**
     * The mode options an action honors.
     *
     * @remarks The options are the domain meaning of the flags a command line carries, without the
     * `Flags` machinery: a caller that is not a command line passes them directly.
     */
    export interface Options {
        /** Whether the resolver uses the CDN target of an alias instead of its local one. */
        cdn?: boolean;

        /** Whether the path rewriting keeps watching the built files after its first pass. */
        watch?: boolean;

        /** Whether the output of every command is shown as it comes. */
        verbose?: boolean;

        /** Whether only failures are reported, one line per failed command. */
        silent?: boolean;

        /** Whether the output is drawn inside boxes, with timestamps, levels and names. */
        decorate?: boolean;
    }

    /**
     * The policy the run is presented through, built for the mode the options asked for.
     * @param options - The options of the action being run.
     * @returns The policy of the run, never `null`: the evidence is written whether it is asked for or not.
     *
     * @remarks The policy is also what settles the channel the lifecycle of the run is reported through, so
     * every action asks for it first and reports through `policy.report`: a `silent` run that said
     * "Installing dependencies..." would not be silent, and an undecorated run would still draw boxes
     * around lines that carry nothing but what they say.
     *
     * @remarks An action reports through the policy and not through a console, which belongs to the surface
     * DepFlow was built on: the help, the prompt and the verdict of an invocation are drawn elsewhere, and
     * they stay visible in every mode.
     */
    export function policy(options: Options = {}): OutputPolicy {
        return new OutputPolicy({
            logger: new Logger({ name: 'depflow', save: true }),
            name: 'depflow',
            verbose: options.verbose ?? false,
            silent: options.silent ?? false,
            decorate: options.decorate ?? true
        });
    }

    /**
     * Adds a git dependency to the configuration, creating the file from the defaults when it does not exist.
     * @param context - The project the action operates on.
     * @param args - The repository URL and, optionally, the name to register the dependency under.
     * @param options - The mode options of the run.
     * @returns A promise resolving when the dependency is persisted.
     */
    export async function add(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            let [repo, name] = args;

            out.info(`Adding dependency...`);

            DepUtils.repo(repo);
            if (!name) name = DepUtils.getRepoName(repo);

            const dep = schema.Dependency.GitDependency.process({ name, repo });

            const config = await Config.load(context.configPath);
            const taken = config.data.dependencies.some(existing => existing.name === dep.name);
            if (taken) throw new Error(`A dependency named "${dep.name}" already exists, remove it first or add this one with another name.`);
            config.data.dependencies.push(dep);
            await config.save();

            out.info(`Added dependency "${dep.name}".`);
        } finally { if (boxed) out.end(); }
    }

    /**
     * Removes a dependency from the configuration and uninstalls its files.
     * @param context - The project the action operates on.
     * @param args - The name (git or npm) or the git repository URL of the dependency to remove.
     * @param options - The mode options of the run.
     * @returns A promise resolving when the dependency is gone.
     */
    export async function remove(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            const [ identifier ] = args;
            if (!identifier) throw new Error('Usage: dep remove <name> | <repo_url>');

            const config = await Config.load(context.configPath);
            const gitMatches = config.data.dependencies.filter(dep => dep.name === identifier || dep.repo === identifier);
            const npmMatches = config.data.npmDependencies.filter(dep => dep.name === identifier);
            if (gitMatches.length + npmMatches.length === 0) throw new Error(`Dependency "${identifier}" not found.`);

            for (const dep of gitMatches) await new GitDependency(context.flowDirectory, context.projectRoot, dep, out).uninstall();
            for (const dep of npmMatches) await new NpmDependency(context.flowDirectory, context.projectRoot, dep, out).uninstall();

            config.data.dependencies = config.data.dependencies.filter(dep => dep.name !== identifier && dep.repo !== identifier);
            config.data.npmDependencies = config.data.npmDependencies.filter(dep => dep.name !== identifier);
            await config.save();

            out.info(`Removed dependency "${identifier}".`);
        } finally { if (boxed) out.end(); }
    }

    /**
     * Fetches, builds and extracts dependencies, or only the named ones, and synchronizes the aliases afterwards.
     * @param context - The project the action operates on.
     * @param args - The names of the dependencies to install, every one of them when empty.
     * @param options - The mode options of the run, which also settle the mode of the synchronization.
     * @returns A promise resolving when every target is installed and the aliases are synced.
     */
    export async function install(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));

            const config = await Config.load(context.configPath);
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

                    const dependency = new GitDependency(context.flowDirectory, context.projectRoot, dep, out, policy);
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

                    const dependency = new NpmDependency(context.flowDirectory, context.projectRoot, dep, out, policy);
                    await dependency.install();

                    out.line();
                    out.info(`&C2Installed npm dependency &C6${dep.name}.`);
                } finally { if (boxed) out.end(); }
            }

            await Actions.sync(context, [], options, policy);
        } finally { if (boxed) out.end(); }
    }

    /**
     * Runs a named action of the configuration, in the project root.
     * @param context - The project the action operates on.
     * @param args - The name of the action declared in the configuration.
     * @param options - The mode options of the run.
     * @returns A promise resolving when the pipeline of the action is over.
     */
    export async function run(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            const [actionName] = args;
            if (!actionName) throw new Error('Usage: dep run <action>');

            if (boxed) out.group(Group.create('#FFB4DC'));
            out.info(`&C5Running action &C6${actionName}&C5...`);

            const config = await Config.load(context.configPath);
            const action = config.data.actions[actionName];
            if (!action) throw new Error(`action "${actionName}" not found in configuration.`);

            const pipeline = Array.isArray(action) ? action : [action];

            const builder = new Builder({
                cwd: context.projectRoot,
                projectRoot: context.projectRoot,
                pipeline,
                logger: out,
                policy
            });
            await builder.run();
        } finally { if (boxed) out.end(); }
    }

    /**
     * Lists the declared dependencies, marking each one as installed or missing.
     * @param context - The project the action operates on.
     * @param args - Unused; the command takes no positional argument.
     * @param options - The mode options of the run.
     * @returns A promise resolving when every dependency is listed.
     */
    export async function list(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        if (boxed) out.group(Group.create('#FFB4DC'));
        try {
            const config = await Config.load(context.configPath);
            if (config.data.dependencies.length + config.data.npmDependencies.length === 0) {
                out.info(`No dependencies found.`);
            }
            for (const dep of config.data.dependencies) {
                const state = await new GitDependency(context.flowDirectory, context.projectRoot, dep).isInstalled()
                    ? `&C2installed&R` : `&C3missing&R`;
                out.info(`&C6${dep.name} &C7from &C2${dep.repo} &C7(${state}&C7)`);
            }
            for (const dep of config.data.npmDependencies) {
                const state = await new NpmDependency(context.flowDirectory, context.projectRoot, dep).isInstalled()
                    ? `&C2installed&R` : `&C3missing&R`;
                out.info(`&C6${dep.name} &C7v&C2${dep.version} &C7(${state}&C7)`);
            }
        } finally { if (boxed) out.end(); }
    }

    /**
     * Rewrites the import specifiers of the built files of `outDir` according to the resolver.
     * @param context - The project the action operates on.
     * @param args - Unused; the command takes no positional argument.
     * @param options - The mode options of the run; `cdn` and `watch` are honored.
     * @returns A promise resolving when every matched file is rewritten, or when the watcher has started.
     */
    export async function rewritePaths(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        if (boxed) out.group(Group.create('#FFB4DC'));
        try {
            const { watch, cdn } = options;
            const config = await Config.load(context.configPath);
            const mode: PathResolver.Mode = cdn ? 'cdn' : 'local';

            out.info(`Mode: &C3${cdn ? 'CDN' : 'Local'}`);
            if (watch) out.info(`Watcher: &C2Enabled`);

            const resolver = new PathResolver(config.data, context.projectRoot, { logger: out });

            if (watch) await resolver.watch(mode);
            else await resolver.rewritePaths(mode);
        } finally { if (boxed) out.end(); }
    }

    /**
     * Writes the resolver aliases into the configured `tsconfig` and `importmap`.
     * @param context - The project the action operates on.
     * @param args - Unused; the command takes no positional argument.
     * @param options - The mode options of the run; `cdn` selects the mode of the import map.
     * @param caller - The policy of the run to report through, when the synchronization belongs to another
     *                 action. The policy is built from the options when it is omitted.
     * @returns A promise resolving when both files are updated, or skipped when they are not configured.
     */
    export async function sync(context: Context, args: string[], options: Options = {}, caller?: OutputPolicy): Promise<void> {
        const policy = caller ?? Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            out.info(`Synchronizing configurations...`);

            const { cdn } = options;
            const mode: PathResolver.Mode = cdn ? 'cdn' : 'local';

            const config = await Config.load(context.configPath);
            const resolver = new PathResolver(config.data, context.projectRoot, { logger: out });

            const tsconfigFile = config.data.tsconfig;
            const importMapFile = config.data.importmap;
            const tsconfigPath = Path.join(context.projectRoot, tsconfigFile || 'tsconfig.json');
            const importMapPath = Path.join(context.projectRoot, importMapFile || 'importmap.json');

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
     * @param context - The project the action operates on.
     * @param command - The invoked command name ('json-to-yaml' or 'yaml-to-json').
     * @param args - Optional output file path.
     * @param options - The mode options of the run.
     * @returns A promise resolving when the converted file is written.
     */
    export async function convert(context: Context, command: string, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));

            const to = command === 'json-to-yaml' ? 'yaml' : 'json';
            const input = context.configPath;
            const inputExt = Path.extName(input).toLowerCase();
            const isJsonInput = inputExt === '.json';
            const isYamlInput = inputExt === '.yaml' || inputExt === '.yml';
            if (!isJsonInput && !isYamlInput) throw new Error(`Unsupported config file extension: ${inputExt}`);
            if (isYamlInput === (to === 'yaml')) throw new Error(`Config file is already ${to}: ${input}`);

            const config = await Config.load(input);
            const [output] = args;
            const outPath = output || Path.join(context.projectRoot, `${Path.fileName(input, false)}.${to}`);
            await config.save(outPath);

            out.info(`&C2Converted &C4${Path.fileName(input)} &C7→&R &C4${Path.fileName(outPath)} &C2(&C3${to.toUpperCase()}&C2).`);
        } finally { if (boxed) out.end(); }
    }
}
export default Actions;

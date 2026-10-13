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

import type { Target } from '../schema/Config/Resolver.js';
import type { BuilderEntry } from '../schema/Config/Builder.js';

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

        /** Name of the dependency whose resolver or builder an editing command targets. */
        dep?: string;

        /** Name of the named action whose builder an editing command targets. */
        action?: string;

        /** Type identifier of a resolver target, set alongside its local path. */
        type?: string;

        /** CDN URL of a resolver target, set alongside its local path. */
        cdnUrl?: string;

        /** Destination folder of an extract build step. */
        to?: string;

        /** Pattern applied to the destination path of an extract build step. */
        map?: string;

        /** Regular expression a transform build step searches for. */
        search?: string;

        /** Replacement string of a transform build step. */
        replace?: string;

        /** Flags of the regular expression of a transform build step. */
        flags?: string;

        /** Maximum execution time in milliseconds of a run build step. */
        maxTime?: string;

        /** Whether the commands of a run build step may fail. */
        allowFails?: boolean;

        /** Position at which a build step is inserted; appended when omitted. */
        index?: string;

        /** Whether an existing resolver alias is overwritten instead of rejected. */
        force?: boolean;

        /** Whether the added dependency is an npm one instead of a git one. */
        npm?: boolean;

        /** Git tag, branch or commit an added git dependency is checked out at. */
        tag?: string;
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
            const config = await Config.load(context.configPath);

            if (options.npm) {
                const [specifier] = args;
                if (!specifier) throw new Error('Usage: dep add --npm <name>[@<version>]');

                out.info(`Adding npm dependency...`);

                const separator = specifier.lastIndexOf('@');
                const name = separator > 0 ? specifier.slice(0, separator) : specifier;
                const version = separator > 0 ? specifier.slice(separator + 1) : 'latest';
                const dep = schema.Dependency.NpmDependency.process({ name, version });

                const taken = config.data.npmDependencies.some(existing => existing.name === dep.name);
                if (taken) throw new Error(`An npm dependency named "${dep.name}" already exists, remove it first or add this one with another name.`);
                config.data.npmDependencies.push(dep);
                await config.save();

                out.info(`Added npm dependency "${dep.name}".`);
                return;
            }

            let [repo, name] = args;

            out.info(`Adding dependency...`);

            repo = DepUtils.parse(repo).repo;
            if (!name) name = DepUtils.getRepoName(repo);

            const dep = schema.Dependency.GitDependency.process(options.tag ? { name, repo, tag: options.tag } : { name, repo });

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

    /**
     * Edits the resolver aliases of the project or of a named dependency.
     * @param context - The project the action operates on.
     * @param args - The verb and its operands: `add <alias> <local>`, `remove <alias>`, `list` or `clear`.
     * @param options - The mode options of the run; `dep`, `type`, `cdnUrl` and `force` are honored.
     * @returns A promise resolving when the configuration is updated.
     */
    export async function resolver(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            const [verb, ...rest] = args;
            const config = await Config.load(context.configPath);
            const targets = options.dep ? dependencyOf(config, options.dep).resolver : config.data.resolver;
            const where = options.dep ? `dependency "${options.dep}"` : 'the project';

            switch (verb) {
                case 'add': {
                    const [alias, local] = rest;
                    if (!alias || local === undefined) throw new Error('Usage: dep resolver add <alias> <local> [--type <type>] [--cdn-url <url>] [--dep <name>] [--force]');
                    if (alias in targets && !options.force) throw new Error(`A resolver alias "${alias}" already exists in ${where}, use --force to overwrite it.`);

                    targets[alias] = options.type !== undefined || options.cdnUrl !== undefined
                        ? schema.Target.process({
                            local,
                            ...(options.type !== undefined ? { type: options.type } : {}),
                            ...(options.cdnUrl !== undefined ? { cdn: options.cdnUrl } : {})
                        })
                        : schema.Target.process(local);

                    await config.save();
                    out.info(`&C2Added resolver alias &C6"${alias}" &C2to &C6${where}&C2.`);
                    return;
                }
                case 'remove': {
                    const [alias] = rest;
                    if (!alias) throw new Error('Usage: dep resolver remove <alias> [--dep <name>]');
                    if (!(alias in targets)) throw new Error(`Resolver alias "${alias}" not found in ${where}.`);

                    delete targets[alias];
                    await config.save();
                    out.info(`&C2Removed resolver alias &C6"${alias}" &C2from &C6${where}&C2.`);
                    return;
                }
                case 'list': {
                    const entries = Object.entries(targets);
                    if (entries.length === 0) { out.info(`No resolver aliases found in ${where}.`); return; }
                    for (const [alias, target] of entries) out.info(`&C6${alias} &C7→ &C2${describeTarget(target)}`);
                    return;
                }
                case 'clear': {
                    for (const alias of Object.keys(targets)) delete targets[alias];
                    await config.save();
                    out.info(`&C2Cleared the resolver aliases of &C6${where}&C2.`);
                    return;
                }
                default: throw new Error('Usage: dep resolver add|remove|list|clear [--dep <name>]');
            }
        } finally { if (boxed) out.end(); }
    }

    /**
     * Edits the build pipeline of a dependency or of a named action.
     * @param context - The project the action operates on.
     * @param args - The verb and its operands: `add <kind> ...`, `remove <index>`, `move <from> <to>`, `list` or `clear`.
     * @param options - The mode options of the run; `dep`, `action` and the step options are honored.
     * @returns A promise resolving when the configuration is updated.
     */
    export async function builder(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            const [verb, ...rest] = args;
            const config = await Config.load(context.configPath);
            if (options.dep && options.action) throw new Error('--dep and --action cannot be used together.');

            let steps: BuilderEntry[];
            let where: string;
            if (options.dep) {
                steps = dependencyOf(config, options.dep).builder;
                where = `dependency "${options.dep}"`;
            } else if (options.action) {
                const action = config.data.actions[options.action];
                if (!action) throw new Error(`action "${options.action}" not found, create it first with: dep action create ${options.action}`);
                steps = action;
                where = `action "${options.action}"`;
            } else throw new Error('A builder command needs either --dep <name> or --action <name>.');

            switch (verb) {
                case 'add': {
                    const [kind, ...payload] = rest;
                    const entry = buildStep(kind, payload, options);
                    const index = options.index === undefined ? steps.length : stepIndex(options.index, steps.length, true);

                    steps.splice(index, 0, entry);
                    await config.save();
                    out.info(`&C2Added &C6${kind} &C2step to &C6${where}&C2.`);
                    return;
                }
                case 'remove': {
                    const [raw] = rest;
                    if (raw === undefined) throw new Error('Usage: dep builder remove <index> [--dep <name> | --action <name>]');

                    steps.splice(stepIndex(raw, steps.length, false), 1);
                    await config.save();
                    out.info(`&C2Removed step &C6${raw} &C2from &C6${where}&C2.`);
                    return;
                }
                case 'move': {
                    const [rawFrom, rawTo] = rest;
                    if (rawFrom === undefined || rawTo === undefined) throw new Error('Usage: dep builder move <from> <to> [--dep <name> | --action <name>]');

                    const from = stepIndex(rawFrom, steps.length, false);
                    const to = stepIndex(rawTo, steps.length, false);
                    const [entry] = steps.splice(from, 1);
                    steps.splice(to, 0, entry);
                    await config.save();
                    out.info(`&C2Moved step &C6${rawFrom} &C2to &C6${rawTo} &C2in &C6${where}&C2.`);
                    return;
                }
                case 'list': {
                    if (steps.length === 0) { out.info(`No build steps found in ${where}.`); return; }
                    steps.forEach((entry, index) => out.info(`&C6${index} &C7${describeStep(entry)}`));
                    return;
                }
                case 'clear': {
                    steps.splice(0, steps.length);
                    await config.save();
                    out.info(`&C2Cleared the build steps of &C6${where}&C2.`);
                    return;
                }
                default: throw new Error('Usage: dep builder add|remove|move|list|clear ...');
            }
        } finally { if (boxed) out.end(); }
    }

    /**
     * Manages the named build actions of the configuration.
     * @param context - The project the action operates on.
     * @param args - The verb and its operands: `create <name>`, `remove <name>` or `list`.
     * @param options - The mode options of the run.
     * @returns A promise resolving when the configuration is updated.
     */
    export async function action(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            const [verb, ...rest] = args;
            const config = await Config.load(context.configPath);
            const actions = config.data.actions;

            switch (verb) {
                case 'create': {
                    const [name] = rest;
                    if (!name) throw new Error('Usage: dep action create <name>');
                    if (name in actions) throw new Error(`action "${name}" already exists.`);

                    actions[name] = schema.Builder.process([]);
                    await config.save();
                    out.info(`&C2Created action &C6${name}&C2.`);
                    return;
                }
                case 'remove': {
                    const [name] = rest;
                    if (!name) throw new Error('Usage: dep action remove <name>');
                    if (!(name in actions)) throw new Error(`action "${name}" not found.`);

                    delete actions[name];
                    await config.save();
                    out.info(`&C2Removed action &C6${name}&C2.`);
                    return;
                }
                case 'list': {
                    const names = Object.keys(actions);
                    if (names.length === 0) { out.info('No actions found.'); return; }
                    for (const name of names) out.info(`&C6${name} &C7(${actions[name].length} step(s))`);
                    return;
                }
                default: throw new Error('Usage: dep action create|remove|list');
            }
        } finally { if (boxed) out.end(); }
    }

    /**
     * Reads and edits the top-level settings of the configuration.
     * @param context - The project the action operates on.
     * @param args - The verb and its operands: `get [key]`, `set <key> <value>` or `unset <key>`.
     * @param options - The mode options of the run.
     * @returns A promise resolving when the configuration is updated.
     */
    export async function config(context: Context, args: string[], options: Options = {}): Promise<void> {
        const policy = Actions.policy(options);
        const out = policy.report;
        const boxed = policy.decoration === 'on';

        try {
            if (boxed) out.group(Group.create('#FFB4DC'));
            const [verb, key, value] = args;
            const loaded = await Config.load(context.configPath);

            switch (verb) {
                case 'get': {
                    const keys = key ? [ key ] : [ ...SETTINGS ];
                    for (const name of keys) {
                        if (!isSetting(name)) throw new Error(`Unknown setting "${name}", expected one of: ${SETTINGS.join(', ')}.`);
                        out.info(`&C6${name} &C7= &C2${loaded.data[name] ?? 'null'}`);
                    }
                    return;
                }
                case 'set': {
                    if (!key || value === undefined) throw new Error('Usage: dep config set <outDir|tsconfig|importmap> <value>');
                    if (!isSetting(key)) throw new Error(`Unknown setting "${key}", expected one of: ${SETTINGS.join(', ')}.`);

                    if (key === 'outDir') loaded.data.outDir = value;
                    else if (key === 'tsconfig') loaded.data.tsconfig = value === 'null' ? null : value;
                    else loaded.data.importmap = value === 'null' ? null : value;

                    await loaded.save();
                    out.info(`&C2Set &C6${key} &C2to &C6${value}&C2.`);
                    return;
                }
                case 'unset': {
                    if (!key) throw new Error('Usage: dep config unset <tsconfig|importmap>');
                    if (key === 'outDir') throw new Error('"outDir" cannot be unset, no build output directory can be left undefined.');
                    if (key !== 'tsconfig' && key !== 'importmap') throw new Error(`Unknown setting "${key}", expected one of: ${SETTINGS.join(', ')}.`);

                    loaded.data[key] = null;
                    await loaded.save();
                    out.info(`&C2Unset &C6${key}&C2.`);
                    return;
                }
                default: throw new Error('Usage: dep config get|set|unset ...');
            }
        } finally { if (boxed) out.end(); }
    }

    /** The top-level settings the config command reads and edits. **/
    const SETTINGS = [ 'outDir', 'tsconfig', 'importmap' ] as const;

    /**
     * Whether a name is one of the top-level settings the config command edits.
     * @param name - The name to check.
     * @returns `true` when the setting is one this command understands.
     */
    function isSetting(name: string): name is typeof SETTINGS[number] {
        return (SETTINGS as readonly string[]).includes(name);
    }

    /**
     * Locates a dependency by its name, whether it is a git or an npm one.
     * @param config - The loaded configuration.
     * @param name - The name of the dependency.
     * @returns The git or npm dependency of that name.
     * @throws { Error } When no dependency of the configuration carries that name.
     */
    function dependencyOf(config: Config, name: string) {
        const git = config.data.dependencies.find(dependency => dependency.name === name);
        if (git) return git;
        const npm = config.data.npmDependencies.find(dependency => dependency.name === name);
        if (npm) return npm;
        throw new Error(`Dependency "${name}" not found.`);
    }

    /**
     * Describes a resolver target as a single line.
     * @param target - The target to describe.
     * @returns The local path of the target, with its type and CDN URL when it carries them.
     */
    function describeTarget(target: Target): string {
        if (typeof target === 'string') return target;
        const parts = [ target.local ];
        if (target.type) parts.push(`type: ${target.type}`);
        if (target.cdn) parts.push(`cdn: ${target.cdn}`);
        return parts.join(' ');
    }

    /**
     * Builds a single build step from the kind the command names and the options it carries.
     * @param kind - The kind of the step: `run`, `extract` or `transform`.
     * @param payload - The positional operands that follow the kind.
     * @param options - The step options of the run.
     * @returns The processed build step.
     * @throws { Error } When the kind is unknown or the operands are incomplete.
     */
    function buildStep(kind: string, payload: string[], options: Options): BuilderEntry {
        switch (kind) {
            case 'run': {
                if (payload.length === 0) throw new Error('Usage: dep builder add run <command> [<command>...] [--max-time <ms>] [--allow-fails] [--dep <name> | --action <name>]');
                const run = payload.length === 1 ? payload[0] : payload;

                let maxTimeMs: number | undefined;
                if (options.maxTime !== undefined) {
                    maxTimeMs = Number(options.maxTime);
                    if (!Number.isFinite(maxTimeMs)) throw new Error(`Invalid --max-time value: ${options.maxTime}`);
                }

                return schema.RunEntry.process({
                    run,
                    ...(maxTimeMs !== undefined ? { maxTimeMs } : {}),
                    ...(options.allowFails !== undefined ? { allowFails: options.allowFails } : {})
                });
            }
            case 'extract': {
                const [glob] = payload;
                if (!glob || options.to === undefined) throw new Error('Usage: dep builder add extract <glob> --to <dir> [--map <pattern>] [--dep <name> | --action <name>]');

                return schema.ExtractEntry.process({
                    extract: { [glob]: { to: options.to, ...(options.map !== undefined ? { map: options.map } : {}) } }
                });
            }
            case 'transform': {
                const [glob] = payload;
                if (!glob || options.search === undefined || options.replace === undefined) throw new Error('Usage: dep builder add transform <glob> --search <regex> --replace <text> [--flags <flags>] [--dep <name> | --action <name>]');

                return schema.TransformEntry.process({
                    transform: {
                        glob,
                        search: options.search,
                        replace: options.replace,
                        ...(options.flags !== undefined ? { flags: options.flags } : {})
                    }
                });
            }
            default: throw new Error(`Unknown build step "${kind}", expected one of: run, extract, transform.`);
        }
    }

    /**
     * Validates a step position against a pipeline.
     * @param raw - The position as written.
     * @param length - The number of steps the pipeline holds.
     * @param allowEnd - Whether the position just past the last step is accepted.
     * @returns The position as a number.
     * @throws { Error } When the position is not a whole number within the accepted range.
     */
    function stepIndex(raw: string, length: number, allowEnd: boolean): number {
        const index = Number(raw);
        const limit = allowEnd ? length : length - 1;
        if (!Number.isInteger(index) || index < 0 || index > limit) throw new Error(`Invalid step index "${raw}", expected a whole number between 0 and ${limit}.`);
        return index;
    }

    /**
     * Describes a build step as a single line.
     * @param entry - The build step to describe.
     * @returns A short description of the step.
     */
    function describeStep(entry: BuilderEntry): string {
        if ('run' in entry) {
            const run = Array.isArray(entry.run) ? entry.run.join(' && ') : entry.run;
            const limit = entry.maxTimeMs === -1 ? 'no limit' : `${entry.maxTimeMs}ms`;
            return `run: ${run} (${limit}${entry.allowFails ? ', allow fails' : ''})`;
        }
        if ('extract' in entry) {
            const mapping = typeof entry.extract === 'string' ? { [entry.extract]: entry.extract } : entry.extract;
            return `extract: ${Object.keys(mapping).join(', ')}`;
        }
        return `transform: ${entry.transform.glob}`;
    }
}
export default Actions;

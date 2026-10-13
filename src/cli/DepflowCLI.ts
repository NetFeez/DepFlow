/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description The console surface of DepFlow: it declares the project commands and wires each one to the
 *              action of `Actions` that carries it out.
 * @license Apache-2.0
 */

import { Path } from '@netfeez/common-node';

import CLI from './CLI.js';
import Actions from './Actions.js';
import Flags from './Flags.js';

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

/**
 * The flags an editing command owns, defined once so every command that carries one shares its type
 * and its description instead of restating them.
 **/
const EDITING = {
    dep: {
        type: 'string',
        description: 'Name of the dependency whose resolver or builder an editing command targets. Omitted, the command edits the project resolver.'
    },
    action: {
        type: 'string',
        description: 'Name of the named action whose builder an editing command targets.'
    },
    type: {
        type: 'string',
        description: 'Type identifier of a resolver target, set alongside its local path.'
    },
    cdnUrl: {
        type: 'string',
        aliases: ['cdn-url'],
        description: 'CDN URL of a resolver target, set alongside its local path.'
    },
    to: {
        type: 'string',
        description: 'Destination folder of an extract build step.'
    },
    map: {
        type: 'string',
        description: 'Pattern applied to the destination path of an extract build step.'
    },
    search: {
        type: 'string',
        description: 'Regular expression a transform build step searches for.'
    },
    replace: {
        type: 'string',
        description: 'Replacement string of a transform build step.'
    },
    flags: {
        type: 'string',
        description: 'Flags of the regular expression of a transform build step. Defaults to "g".'
    },
    maxTime: {
        type: 'string',
        aliases: ['max-time'],
        description: 'Maximum execution time in milliseconds of a run build step. A value of -1 disables the limit.'
    },
    allowFails: {
        type: 'boolean',
        aliases: ['allow-fails'],
        description: 'Whether the commands of a run build step may fail. Defaults to false.'
    },
    index: {
        type: 'string',
        description: 'Position at which a build step is inserted. Omitted, it is appended at the end.'
    },
    force: {
        type: 'boolean',
        description: 'Overwrites an existing resolver alias instead of failing.'
    },
    npm: {
        type: 'boolean',
        description: 'Adds an npm dependency instead of a git one.'
    },
    tag: {
        type: 'string',
        description: 'Git tag, branch or commit an added git dependency is checked out at. Defaults to "main".'
    }
} as const satisfies Flags.Declaration;

/** The flags the `resolver` command owns, beside the global ones. **/
const resolverOwn = { dep: EDITING.dep, type: EDITING.type, cdnUrl: EDITING.cdnUrl, force: EDITING.force } as const satisfies Flags.Declaration;

/** The flags the `builder` command owns, beside the global ones. **/
const builderOwn = {
    dep: EDITING.dep,
    action: EDITING.action,
    to: EDITING.to,
    map: EDITING.map,
    search: EDITING.search,
    replace: EDITING.replace,
    flags: EDITING.flags,
    maxTime: EDITING.maxTime,
    allowFails: EDITING.allowFails,
    index: EDITING.index
} as const satisfies Flags.Declaration;

/** The flags the `add` command owns, beside the global ones. **/
const addOwn = { npm: EDITING.npm, tag: EDITING.tag } as const satisfies Flags.Declaration;

/** The flags accepted by `resolver`: the global ones plus the ones it owns. **/
const resolverFlags = new Flags({ ...options.declaration, ...resolverOwn });

/** The flags accepted by `builder`: the global ones plus the ones it owns. **/
const builderFlags = new Flags({ ...options.declaration, ...builderOwn });

/** The flags accepted by `add`: the global ones plus the ones it owns. **/
const addFlags = new Flags({ ...options.declaration, ...addOwn });

export class DepflowCLI extends CLI {
    /** Path of the configuration file the commands operate on, as the command line gave it. **/
    public configPath: string;

    public constructor(configPath: string = 'depFlow.yml') { super(options.declaration, {
        name: 'C-UI',
        title: '&C1DepFlow &C5CLI &C6by NetFeez',
        prompt: '&C5[DepFlow] << &C6&S'
    });

        this.configPath = configPath;

        this.addCommand('add', (command, args, flags: typeof addFlags.infer = addFlags.defaults) => Actions.add(this.context, args, flags), {
            usage: 'dep add <repo_url> [name] [--tag <ref>] | dep add --npm <name>[@<version>]',
            description: 'Add a dependency to the configuration file.',
            args: {
                repo_url: { description: 'URL of the git repository to add.' },
                name: { description: 'Name to register the dependency under; derived from the repository URL when it is omitted.', required: false }
            },
            flags: addOwn
        });
        this.addCommand('remove', (command, args, flags = options.defaults) => Actions.remove(this.context, args, flags), {
            usage: 'dep remove <name> | <repo_url>',
            description: 'Remove a dependency from the configuration file and uninstall its files.',
            args: {
                identifier: { description: 'Name or repository URL of the dependency to remove.' }
            }
        });
        this.addCommand('install', (command, args, flags = options.defaults) => Actions.install(this.context, args, flags), {
            usage: 'dep install [name1 name2 ...]',
            description: 'Install dependencies. If names are provided, only those dependencies will be installed.',
            args: {
                names: { description: 'Names of the dependencies to install; every dependency when none is given.', required: false, variadic: true }
            }
        });
        this.addCommand('run', (command, args, flags = options.defaults) => Actions.run(this.context, args, flags), {
            usage: 'dep run <script>',
            description: 'Run a custom action defined in the configuration file.',
            args: {
                script: { description: 'Name of the action declared in the configuration file.' }
            }
        });
        this.addCommand('list', (command, args, flags = options.defaults) => Actions.list(this.context, args, flags), { usage: 'dep list', description: 'List all dependencies in the configuration file.' });
        this.addCommand('resolver', (command, args, flags: typeof resolverFlags.infer = resolverFlags.defaults) => Actions.resolver(this.context, args, flags), {
            usage: 'dep resolver add <alias> <local> [--type <t>] [--cdn-url <url>] | remove <alias> | list | clear [--dep <name>]',
            description: 'Edits the resolver aliases of the project or of a named dependency.',
            flags: resolverOwn
        });
        this.addCommand('builder', (command, args, flags: typeof builderFlags.infer = builderFlags.defaults) => Actions.builder(this.context, args, flags), {
            usage: 'dep builder add <run|extract|transform> ... | remove <index> | move <from> <to> | list | clear [--dep <name> | --action <name>]',
            description: 'Edits the build pipeline of a dependency or of a named action.',
            flags: builderOwn
        });
        this.addCommand('action', (command, args, flags = options.defaults) => Actions.action(this.context, args, flags), {
            usage: 'dep action create <name> | remove <name> | list',
            description: 'Manages the named build actions of the configuration.'
        });
        this.addCommand('config', (command, args, flags = options.defaults) => Actions.config(this.context, args, flags), {
            usage: 'dep config get [key] | set <key> <value> | unset <key>',
            description: 'Reads and edits the top-level settings of the configuration (outDir, tsconfig, importmap).'
        });
        this.addCommand('rewrite-paths', (command, args, flags = options.defaults) => Actions.rewritePaths(this.context, args, flags), { usage: 'dep rewrite-paths [--watch] [--cdn]', description: 'Rewrite the paths of the built files of outDir according to the resolver entries of the configuration.' });
        this.addCommand('sync', (command, args, flags = options.defaults) => Actions.sync(this.context, args, flags), { usage: 'dep sync', description: 'Write the resolver entries into the paths of the declared tsconfig and into the declared importmap.'  });
        this.addCommand('json-to-yaml', (command, args, flags = options.defaults) => Actions.convert(this.context, command, args, flags), {
            usage: 'dep json-to-yaml [output.yaml]',
            description: 'Convert the depflow config file from JSON to YAML.',
            args: {
                output: { description: 'Path of the YAML file to write; derived from the config file name when it is omitted.', required: false }
            }
        });
        this.addCommand('yaml-to-json', (command, args, flags = options.defaults) => Actions.convert(this.context, command, args, flags), {
            usage: 'dep yaml-to-json [output.json]',
            description: 'Convert the depflow config file from YAML to JSON.',
            args: {
                output: { description: 'Path of the JSON file to write; derived from the config file name when it is omitted.', required: false }
            }
        });
    }

    /** Absolute path of the directory holding the configuration file, the project root. **/
    public get projectRoot(): string { return Path.dirname(Path.resolve(process.cwd(), this.configPath)); }

    /** Absolute path of the flow directory (`.depflow`) under the project root. **/
    protected get flowDirectory(): string { return Path.join(this.projectRoot, '.depflow'); }

    /** The project the commands operate on: the context every action is driven with. **/
    public get context(): Actions.Context {
        return {
            configPath: this.configPath,
            projectRoot: this.projectRoot,
            flowDirectory: this.flowDirectory
        };
    }
}
export namespace DepflowCLI {
    export type Exec = (this: DepflowCLI, command: string, args: string[], flags: Options) => Promise<void> | void;

    /** The values of the flags accepted by the CLI. **/
    export type Options = typeof options.infer;
}
export default DepflowCLI;

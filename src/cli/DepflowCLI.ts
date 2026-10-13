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

export class DepflowCLI extends CLI {
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

        this.addCommand('add', (command, args, flags = options.defaults) => Actions.add(this.context, args, flags), {
            usage: 'dep add <repo_url> [name]',
            description: 'Add a dependency to the configuration file.',
            args: {
                repo_url: { description: 'URL of the git repository to add.' },
                name: { description: 'Name to register the dependency under; derived from the repository URL when it is omitted.', required: false }
            }
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

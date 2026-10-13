/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description The console interface the CLI is built on: it reads a command, runs it and answers it,
 *              and it draws the help the global flags, and the arguments and flags of every command are told in.
 * @license Apache-2.0
 */

import { Logger, ConsoleUI } from '@netfeez/vterm';

import type { Engine, ConsoleTransport } from '@netfeez/vterm';
import type Flags from './Flags.js';

/** The visible column the description of a flag or an argument starts at, in `help`. **/
const HELP_COLUMN = 26;

export class CLI {
    /** What reads the input of the console interface. */
    protected dataHandleInstance: CLI.dataHandler;

    /** What is written before every command the interface reads. */
    public prompt: string;

    /** The input the interface reads commands from. */
    public in: NodeJS.ReadStream;

    /** The engine the interface answers through. */
    public out: Engine;

    /** The commands the interface accepts, keyed by the name each one is invoked with. */
    public commandMap: CLI.CommandMap;

    /** The terminal the prompt and the help are written to. */
    protected console: ConsoleTransport;

    /** The flags that are not specific to a command, keyed by the name each one is declared under. */
    protected globals: Flags.Declaration;

    /** The branded line the help opens with. */
    protected title: string;

    /**
     * Wires a console interface to its terminal, its global flags and its commands.
     * @param globals - The flags no command owns, declared as `Flags` declares them.
     * @param config - How the interface presents itself: the name of its runs, its prompt and its title.
     */
    public constructor(globals: Flags.Declaration = {}, config: CLI.Config = {}) {
        this.dataHandleInstance = this.dataHandler.bind(this);
        this.prompt = ConsoleUI.formatText(config.prompt ?? '&C5[CLI] << &C6&S');
        this.in = process.stdin;

        const logger = new Logger({ name: config.name ?? 'CLI' });
        this.out = logger.engine;
        this.console = logger.console;

        this.globals = globals;
        this.title = config.title ?? '&C1CLI';
        this.commandMap = {};
        this.addDefaultCommands();
    }

    /** Starts reading what is written to the input. **/
    protected startReadIn() {
        this.in.on('data', this.dataHandleInstance);
        this.console.write(this.prompt);
    }

    /** Stops reading what is written to the input. **/
    protected stopReadIn() { this.in.off('data', this.dataHandleInstance); }

    /** Starts the console UI. **/
    public start() { this.startReadIn(); }

    /** Stops the console UI. **/
    public stop() { this.stopReadIn(); }

    /**
     * Runs the command the input carries, and writes the prompt again unless the command leaves.
     * @param data - What arrived in the input.
     * @returns A promise of the command being over.
     */
    protected async dataHandler(data: Buffer): Promise<void> {
        const [cmd, ...args] = data.toString('utf-8').trim().split(' ');
        this.out.log(`&C(80,0,80)command received: &C3${cmd}`, args);
        try {
            const command = this.commandMap[cmd];
            if (command) await command.exec.bind(this)(cmd, args);
            else this.out.error(`&C1Unknown command: &C3${cmd}`);
        } catch(error) {
            this.out.error(`&C1Error executing command: &C3${cmd}`, error);
        }
        if (cmd !== 'exit-debug') this.console.write(this.prompt);
    }

    /**
     * The command of that name, when the map carries one.
     * @param command - The name of the command.
     * @returns The command, or undefined when the map carries no command of that name.
     */
    public getCommand(command: string): CLI.Command | undefined { return this.commandMap[command]; }

    /**
     * The declaration of the flags a command line accepts: the global ones every command carries, plus the
     * ones the named command owns.
     * @param command - The name of the command, when the line named one.
     * @returns The declaration the flags of that command line are parsed against.
     *
     * @remarks A named command that the map does not carry gets the global flags alone: the line is still
     * parsed, so a token that is a flag of no command is reported as an unknown flag rather than as an
     * unknown command.
     */
    public declarationOf(command?: string): Flags.Declaration {
        const own = command === undefined ? undefined : this.commandMap[command]?.flags;
        return own ? { ...this.globals, ...own } : this.globals;
    }

    /**
     * Puts a command in the map.
     * @param command - The name of the command.
     * @param exec - What the command does when it is written.
     * @param info - What `help` tells about it, the arguments it accepts among it.
     * @returns This instance, so commands can be added one after another.
     */
    public addCommand(command: string, exec: CLI.commandExec, info?: CLI.CommandInfo): this {
        this.commandMap[command] = { name: command, exec, ...info };
        return this;
    }

    /**
     * Takes a command out of the map.
     * @param command - The name of the command.
     * @returns This instance, so commands can be removed one after another.
     */
    public removeCommand(command: string): this {
        delete this.commandMap[command];
        return this;
    }

    /**
     * Puts the commands every console interface carries in the map.
     **/
    protected addDefaultCommands() {
        this.addCommand('help', this.showHelp.bind(this), { description: '&C6Shows this help', usage: 'help' });
        this.addCommand('exit', () => process.exit(), { description: '&C6Exits the process', usage: 'exit' });
    }

    /**
     * Writes the banner, the global flags and every command of the map with its usage, its description
     * and the arguments and flags it accepts.
     *
     * @remarks The help belongs to the terminal and not to a run, so it is written as it is composed
     * and it is not announced through the engine: no timestamp, level or name is put in front of it,
     * and a line is only broken where this method breaks it.
     **/
    protected showHelp() {
        const width = Math.max(40, Math.min(process.stdout.columns ?? 80, 100));
        const box = '&C5';
        const lines: string[] = [ this.title, '', '&C6Global flags:' ];

        for (const [ name, flag ] of Object.entries(this.globals)) {
            const key = CLI.flagKey(name, flag);
            lines.push(...CLI.describe(key, flag.description ?? '', width));
        }

        lines.push('', '&C6Commands:');
        for (const command of Object.values(this.commandMap)) {
            lines.push(`&C3 > ${command.name}`);
            if (command.usage) lines.push(`   &C7Usage: &C6${command.usage}`);
            if (command.description) lines.push(...CLI.wrap(command.description, width - 5).map(line => `   ${line}`));
            for (const [ name, argument ] of Object.entries(command.args ?? {})) {
                lines.push(...CLI.describe(CLI.argumentKey(name, argument), argument.description, width, 5));
            }
            for (const [ name, flag ] of Object.entries(command.flags ?? {})) {
                lines.push(...CLI.describe(CLI.flagKey(name, flag), flag.description ?? '', width, 5));
            }
            lines.push('');
        }

        const edge = `${box}╭${'─'.repeat(width - 2)}`;
        this.console.log(edge);
        for (const line of lines) this.console.log(`${box}│ ${line}`);
        this.console.log(`${box}╰${'─'.repeat(width - 2)}`);
    }

    /**
     * The name of a flag as the help writes it, with the aliases it accepts and the value it takes.
     * @param name - The name the flag is declared under.
     * @param flag - The declared flag.
     * @returns The name of the flag, colored.
     */
    protected static flagKey(name: string, flag: Flags.Flag): string {
        const names = [ name, ...flag.aliases ?? [] ].map(alias => alias.length === 1 ? `-${alias}` : `--${alias}`);
        const value = flag.type === 'boolean' ? '' : ' &C7<string>';
        return `&C3${names.join(', ')}${value}`;
    }

    /**
     * The name of an argument as the help writes it, telling an optional one and a variadic one apart.
     * @param name - The name the argument is declared under.
     * @param argument - The declared argument.
     * @returns The name of the argument, colored.
     */
    protected static argumentKey(name: string, argument: CLI.Argument): string {
        const core = argument.variadic ? `${name}...` : name;
        const written = (argument.required ?? true) ? `<${core}>` : `[${core}]`;
        return `&C3${written}`;
    }

    /**
     * Lays out a name and what it is for in the columns left after the name.
     * @param key - The name, with the tokens that color it.
     * @param description - What the name is for.
     * @param width - The visible width every line is kept within.
     * @param indent - The visible columns the entry starts at.
     * @returns The lines of the entry, the description broken in as many lines as it needs.
     */
    protected static describe(key: string, description: string, width: number, indent: number = 3): string[] {
        const column = indent + HELP_COLUMN;
        const lead = ' '.repeat(indent);
        const padding = ' '.repeat(Math.max(1, column - indent - CLI.visibleWidth(key)));
        const available = Math.max(20, width - column);
        const wrapped = CLI.wrap(description, available);
        if (wrapped.length === 0) return [ `${lead}${key}` ];
        return wrapped.map((line, index) => index === 0
            ? `${lead}${key}${padding}&C7${line}`
            : `${' '.repeat(column)}&C7${line}`);
    }

    /**
     * Breaks a text in as many lines as it needs to fit a visible width, on its word boundaries.
     * @param text - The text to break, without tokens in it.
     * @param width - The visible width every line is kept within.
     * @returns The lines the text was broken in.
     */
    protected static wrap(text: string, width: number): string[] {
        const lines: string[] = [];
        let current = '';
        for (const word of text.split(' ')) {
            if (current && CLI.visibleWidth(current) + 1 + CLI.visibleWidth(word) > width) {
                lines.push(current);
                current = word;
            } else current = current ? `${current} ${word}` : word;
        }
        if (current) lines.push(current);
        return lines;
    }

    /**
     * The columns a text paints, with its tokens taken out.
     * @param text - The text to measure, with the tokens of the grammar in it.
     * @returns The number of visible columns it paints.
     */
    protected static visibleWidth(text: string): number { return ConsoleUI.cleanFormat(text).length; }
}

export namespace CLI {
    export type dataHandler = (data: Buffer) => void;
    export type commandExec = (this: CLI, command: string, args: string[]) => Promise<void> | void;

    /** A positional argument a command accepts. **/
    export interface Argument {
        /** What the argument is for. **/
        description: string;

        /** Whether the command cannot run without it. Defaults to `true`. **/
        required?: boolean;

        /** Whether the argument takes every token that follows, written with a trailing ellipsis. **/
        variadic?: boolean;
    }

    /** The positional arguments a command accepts, keyed by the name each one is declared under. **/
    export type Arguments = { readonly [name: string]: Argument };

    /** What `help` tells about a command. **/
    export interface CommandInfo {
        description?: string;
        usage?: string;
        args?: Arguments;

        /** The flags the command owns, beside the global ones every command carries. **/
        flags?: Flags.Declaration;
    }

    /** A command of the console interface, with what it does and what `help` tells about it. **/
    export interface Command extends CommandInfo {
        name: string;
        exec: commandExec;
    }

    /** The commands of the interface, keyed by the name each one is invoked with. **/
    export interface CommandMap {
        [command: string]: Command;
    }

    /** How the console interface presents itself. **/
    export interface Config {
        /** The name every run of the interface is written with. **/
        name?: string;

        /** The prompt written before every command, with the tokens of the console grammar. **/
        prompt?: string;

        /** The branded line the help opens with, with the tokens of the console grammar. **/
        title?: string;
    }
}
export default CLI;

/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Runs one instruction, as a script in a shared shell or as its own process, streaming its
 * output and settling exactly one verdict for it.
 * @license Apache-2.0
 */

import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import { Events } from "@netfeez/common";

export class Command extends Events<Command.EventMap> {
    /**
     * Monotonic source of the markers written into the shell, so two commands executed in the same
     * millisecond can never share one, and a marker can never be replayed by a later command.
     */
    private static vToken: number = 0;

    /**
     * The shells already read by a command, so the reader of a shell shared by the instructions of a
     * task is attached once instead of once per instruction.
     */
    private static vShells: WeakMap<Command.Shell, Command.ShellState> = new WeakMap();

    protected readonly mode: Command.Mode;
    protected readonly shell: Command.Shell | null;
    protected readonly script: string;
    protected readonly program: Command.Program;

    /** The sentinel the shell writes once the instruction finished, carrying its exit status. */
    protected readonly marker: string;

    protected child: Command.Process | null = null;
    protected settled: boolean = false;
    protected startedAt: number = 0;

    protected output: string = '';
    protected errors: string = '';
    protected outputCursor: number = 0;
    protected errorsCursor: number = 0;

    private vOrdinal: number;

    private constructor(mode: Command.Mode, options: Command.Options) { super();
        this.mode = mode;
        this.shell = options.shell ?? null;
        this.script = options.script ?? '';
        this.program = options.program ?? { executable: '', args: [] };
        this.marker = Command.token();
        this.vOrdinal = options.ordinal ?? 1;
    }

    /**
     * Creates a command that runs a script in an already running shell.
     * @param shell - The shell the script is written to, or `null` when the shell of the task is gone.
     * @param script - The shell script to run.
     * @returns The command, not yet started.
     *
     * @remarks The shell is not owned by the command: it outlives it, so the death of a command is
     * never the death of the shell, and a shell that dies is reported by the task that owns it. A
     * command with no shell fails as soon as it runs, instead of waiting for output that can never
     * come.
     *
     * @remarks The ordinal travels with every line the command emits, so the task never has to invent
     * which of its instructions a line belongs to.
     *
     * @param ordinal - The position of the instruction inside its task, starting at 1.
     */
    public static inShell(shell: Command.Shell | null, script: string, ordinal: number = 1): Command {
        return new Command('shell', { shell: shell ?? undefined, script, ordinal });
    }

    /**
     * Creates a command that runs a program in a process of its own, where nothing in the arguments
     * nor in the working directory can be reinterpreted by a shell.
     * @param program - The program to run.
     * @param ordinal - The position of the instruction inside its task, starting at 1.
     * @returns The command, not yet started.
     */
    public static asProgram(program: Command.Program, ordinal: number = 1): Command {
        return new Command('program', { program, ordinal });
    }

    /**
     * Creates a shell for running scripts, started in the given working directory.
     * @param cwd - The working directory the shell is started in, so a script never needs to `cd` into
     * the folder the task belongs to reach it.
     * @returns The shell process.
     *
     * @remarks The shell leads its own process group where the platform allows it, so the task owning
     * it can take down the whole tree of processes a script left behind. It holds the event loop while
     * the task runs, and the task releases it when it is done, so a task in flight is never cut short.
     *
     * @remarks The arguments of the shell are its own, never a string to be interpreted: `cmd.exe` is
     * started quiet (`/Q`) and without the autorun registry entries (`/D`), so it neither greets itself
     * nor echoes the orders it is given. The greeting a shell still writes is dropped by
     * {@link Command.prepare}.
     */
    public static createShell(cwd: string): Command.Shell {
        const isWin = process.platform === 'win32';
        return spawn(isWin ? 'cmd.exe' : 'bash', isWin ? [ '/Q', '/D' ] : [], {
            shell: false,
            cwd,
            detached: !isWin,
            stdio: ['pipe', 'pipe', 'pipe']
        });
    }

    /**
     * Silences a shell and waits until it answers, so nothing the shell says about itself is ever read as
     * the output of an instruction.
     * @param shell - The shell to prepare, the one {@link Command.createShell} started.
     * @returns A promise resolving once the shell reported itself ready, or once it is gone.
     *
     * @remarks A shell reading its orders from a pipe narrates them: `cmd.exe` writes its banner and its
     * prompt to stdout before and after every order, and both belong to the shell, not to the
     * instruction that follows. The prompt is reduced to a blank line, and everything the shell wrote
     * before the first instruction took it over is dropped by {@link Command.reader}, so the first
     * instruction starts from a shell that only speaks when spoken to. A shell that is already gone
     * resolves too: the instruction is the one that reports it, not this handshake.
     *
     * The handshake ends on the readiness marker or on the death of the shell, never on the orders
     * having been written: a write that succeeded says nothing about what the shell already said.
     */
    public static prepare(shell: Command.Shell): Promise<void> {
        const state = Command.reader(shell);
        if (state.ready) return Promise.resolve();

        const marker = Command.token();
        return new Promise<void>((resolve) => {
            const onGone = (): void => {
                if (state.ready) return;
                shell.off('exit', onGone);
                shell.off('error', onGone);
                shell.stdin.off('error', onGone);
                state.probe = null;
                state.ready = true;
                resolve();
            };
            const onWritten = (error?: Error | null): void => { if (error) onGone(); };

            state.probe = (text) => { if (text.includes(`${marker}=1`)) onGone(); };
            shell.once('exit', onGone);
            shell.once('error', onGone);
            shell.stdin.on('error', onGone);
            shell.stdin.write(`${Command.warmup(marker)}\n`, onWritten);
        });
    }

    /**
     * The single reader of a shell, attached the first time anything reads it and kept for its whole life.
     * @param shell - The shell to read.
     * @returns The state of the reader, holding whoever is reading the shell right now.
     *
     * @remarks A shell is read through one pair of listeners for its whole life, and what it produced goes
     * to the command reading it, or to nobody while the shell is only talking to itself. The handover is
     * therefore a single assignment, which nothing can slip into: a reader attached to the shell by one
     * instruction and detached by the next leaves a window in which the trailing prompt of the shell is
     * read as the output of the instruction that follows it.
     **/
    protected static reader(shell: Command.Shell): Command.ShellState {
        const existing = Command.vShells.get(shell);
        if (existing) return existing;

        const state: Command.ShellState = { reader: null, probe: null, ready: false };
        shell.stdout.on('data', (data: Buffer) => {
            if (state.reader) state.reader.onStdout(data);
            else state.probe?.(data.toString());
        });
        shell.stderr.on('data', (data: Buffer) => { state.reader?.onStderr(data); });
        Command.vShells.set(shell, state);
        return state;
    }

    /**
     * Takes down a process and every process it started.
     * @param child - The process to take down.
     * @returns void
     **/
    public static terminate(child: Command.Process): void {
        try {
            if (process.platform === 'win32' || !child.pid) child.kill('SIGKILL');
            else process.kill(-child.pid, 'SIGKILL');
        } catch { }
    }

    /**
     * The human readable form of a program, used to describe it when it fails.
     * @param program - The program to format.
     * @returns The program followed by its arguments.
     **/
    public static format(program: Command.Program): string {
        return [program.executable, ...(program.args ?? [])].join(' ');
    }

    /** The human readable form of this instruction, used to describe it when it fails. **/
    public get label(): string {
        return this.mode === 'shell' ? this.script : Command.format(this.program);
    }

    /** The position of this instruction inside its task, starting at 1, carried by every line it emits. **/
    public get ordinal(): number {
        return this.vOrdinal;
    }

    /**
     * Starts the command, emitting a `log` event per stdout line, an `err` event per stderr line and
     * a single `end` event carrying the verdict.
     * @returns void
     *
     * @remarks The verdict is settled exactly once: on the status line the shell writes, on the exit
     * of the process, on a spawn failure, or when the command is killed.
     */
    public exec(): void {
        if (this.settled) return;
        this.startedAt = Date.now();
        if (this.mode === 'shell') this.execInShell();
        else this.execAsProgram();
    }

    /**
     * Takes the command down, carrying why into its verdict.
     * @param reason - Why the command is being killed, carried into its verdict.
     * @returns void
     *
     * @remarks A program is taken down along with every process it started. A script cannot be: it
     * shares the shell with the rest of the task, so the task that owns the shell is the one that takes
     * the shell down when the run ends.
     */
    public kill(reason: Command.Reason = 'stopped'): void {
        if (this.child) Command.terminate(this.child);
        this.settle({ code: null, signal: null, reason });
    }

    /**
     * Runs the script in the shell, followed by the sentinel that carries its exit status.
     * @returns void
     **/
    protected execInShell(): void {
        if (!this.shell) return void this.settle({ code: null, signal: null, reason: 'shell' });
        if (this.shell.exitCode !== null || this.shell.signalCode !== null)
            return void this.settle({ code: null, signal: null, reason: 'shell' });

        Command.reader(this.shell).reader = this;
        this.shell.stdin.on('error', this.onStdinError);

        try {
            this.shell.stdin.write(`${this.script}\n${Command.sentinel(this.marker)}\n`);
        } catch {
            this.settle({ code: null, signal: null, reason: 'shell' });
        }
    }

    /**
     * Runs the program in a process of its own, started in its own working directory.
     * @returns void
     **/
    protected execAsProgram(): void {
        this.child = spawn(this.program.executable, this.program.args ?? [], {
            shell: false,
            cwd: this.program.cwd,
            detached: process.platform !== 'win32',
            stdio: ['pipe', 'pipe', 'pipe']
        });

        this.child.stdout.on('data', this.onStdout);
        this.child.stderr.on('data', this.onStderr);
        this.child.once('error', () => this.settle({ code: null, signal: null, reason: 'spawn' }));
        this.child.once('close', (code, signal) => this.settle({ code, signal, reason: null }));
    }

    /**
     * Consumes a stdout chunk, emitting the lines it closes, and stops at the sentinel when the
     * command is a script.
     * @param data - The raw chunk written to stdout.
     * @returns void
     **/
    protected readonly onStdout = (data: Buffer): void => {
        const chunk = data.toString();
        this.output += chunk;

        if (this.mode === 'shell' && !this.settled) {
            const status = this.sentinel(this.output);
            if (status !== null) {
                this.output = this.output.slice(0, status.index);
                this.stream(true);
                this.settle(status.code === null ? { code: null, signal: null, reason: 'protocol' } : { code: status.code, signal: null, reason: null });
                return;
            }
        }
        this.stream();
    };

    /**
     * The status line the shell wrote, as the index it starts at and the exit status it carries.
     * @param output - The output collected so far.
     * @returns The status, `null` when the line is not there yet, or a null code when it carries none.
     *
     * @remarks Only a whole line that is the sentinel counts, and the sentinel carries a random
     * suffix, so nothing an instruction prints can stand for the shell reporting its status.
     **/
    protected sentinel(output: string): { index: number, code: number | null } | null {
        const match = output.match(new RegExp(`(?:^|\n)(${this.marker})=([^\\n]*)\\n`));
        if (!match || match.index === undefined) return null;

        const code = Number(match[2]);
        return {
            index: match.index + (match[0].startsWith('\n') ? 1 : 0),
            code: Number.isInteger(code) ? code : null
        };
    }

    /**
     * Consumes a stderr chunk, emitting the lines it closes.
     * @param data - The raw chunk written to stderr.
     * @returns void
     **/
    protected readonly onStderr = (data: Buffer): void => {
        this.errors += data.toString();
        this.stream();
    };

    /**
     * Absorbs the failure of writing into a shell that is already gone, which is how a sentinel that
     * will never arrive announces itself.
     * @returns void
     **/
    protected readonly onStdinError = (): void => {
        this.settle({ code: null, signal: null, reason: 'shell' });
    };

    /**
     * Emits the lines both streams have closed since the last call.
     * @param final - Whether the remaining partial line is emitted too, as nothing else will come.
     * @returns void
     **/
    protected stream(final: boolean = false): void {
        this.outputCursor = this.emitLines(this.output, this.outputCursor, 'log', final);
        this.errorsCursor = this.emitLines(this.errors, this.errorsCursor, 'err', final);
    }

    /**
     * Emits the complete lines a buffer holds from a given cursor, each carrying the ordinal of the
     * instruction it belongs to.
     * @param buffer - The accumulated output of the stream.
     * @param cursor - Where the previous call stopped.
     * @param event - The event each line is emitted with.
     * @param final - Whether the trailing partial line is emitted as well.
     * @returns The position the cursor reached.
     **/
    protected emitLines(buffer: string, cursor: number, event: 'log' | 'err', final: boolean): number {
        const end = final ? buffer.length : buffer.lastIndexOf('\n') + 1;
        if (end <= cursor) return cursor;

        for (const line of buffer.slice(cursor, end).split('\n')) {
            const text = line.trim();
            if (text) this.emit(event, text, this.vOrdinal);
        }
        return end;
    }

    /**
     * Settles the verdict of the command, exactly once, detaching every listener it attached.
     * @param outcome - The status, signal and reason the command ended with.
     * @returns void
     **/
    protected settle(outcome: { code: number | null, signal: NodeJS.Signals | null, reason: Command.Reason | null }): void {
        if (this.settled) return;
        this.settled = true;

        if (this.shell) {
            if (Command.reader(this.shell).reader === this) Command.reader(this.shell).reader = null;
            this.shell.stdin.off('error', this.onStdinError);
        }
        this.child?.stdout?.off('data', this.onStdout);
        this.child?.stderr?.off('data', this.onStderr);

        this.stream(true);
        this.emit('end', {
            code: outcome.code,
            signal: outcome.signal,
            reason: outcome.reason,
            output: this.output.trim(),
            error: this.errors.trim(),
            time: Date.now() - this.startedAt
        });
    }

    /**
     * The line the shell writes once the previous instruction finished, in its own dialect.
     * @param marker - The sentinel of the command.
     * @returns The line carrying the exit status of the instruction.
     **/
    protected static sentinel(marker: string): string {
        return process.platform === 'win32'
            ? `echo ${marker}=%errorlevel%`
            : `printf '${marker}=%d\\n' "$?"`;
    }

    /**
     * The orders that turn a fresh shell into one that only reports what an instruction produced.
     * @param marker - The readiness marker of this shell.
     * @returns The lines, in the dialect of the shell.
     *
     * @remarks `cmd.exe` greets itself with a banner and a prompt, and echoes every order it is given;
     * `/Q` already silences the echo, and reducing the prompt to a newline leaves nothing else the
     * reader of an instruction has to tell apart from its output. `bash` reading from a pipe is quiet on
     * its own, so it only has to say it is ready.
     **/
    protected static warmup(marker: string): string {
        return process.platform === 'win32' ? `prompt $_\necho ${marker}=1` : `echo ${marker}=1`;
    }

    /**
     * A marker no other order of this process can carry, taken from a monotonic counter.
     * @returns The marker of the next order written into a shell.
     *
     * @remarks The random suffix keeps a marker from being replayed by an instruction that happens to
     * print it, and the counter keeps two orders written in the same millisecond from sharing one.
     **/
    protected static token(): string {
        return `DEP_FLOW_${++Command.vToken}_${Math.random().toString(36).slice(2, 10)}`;
    }
}

export namespace Command {
    export type Emitter = Events.Emitter<EventMap>;
    export type Process = ChildProcessWithoutNullStreams;
    export type Shell = ChildProcessWithoutNullStreams;
    export type Mode = 'shell' | 'program';
    export type Reason = 'stopped' | 'timeout' | 'shell' | 'spawn' | 'protocol';

    /** The options a command is created with, either a shell and a script or a program. */
    export interface Options {
        shell?: Command.Shell,
        script?: string,
        program?: Command.Program,
        /** The position of the instruction inside its task, starting at 1, carried by every line it emits. */
        ordinal?: number
    }

    /**
     * The reader of a shell that outlives the instruction reading it: the command in flight, the probe
     * waiting for the shell to report itself ready, or neither while the shell is between instructions.
     */
    export interface ShellState {
        /** The command reading the shell right now, or `null` when no instruction is running. */
        reader: Command | null;
        /** Told about every chunk that arrives while no instruction is reading the shell. */
        probe: ((text: string) => void) | null;
        /** Whether the shell already reported itself ready. */
        ready: boolean;
    }

    /**
     * A program to run as a process of its own, where neither the executable, its arguments nor its
     * working directory go through a shell.
     */
    export interface Program {
        executable: string;
        args?: string[];
        cwd?: string;
    }

    /** How an instruction ended, in the only form a task needs to turn it into a verdict. */
    export interface Verdict {
        code: number | null;
        signal: NodeJS.Signals | null;
        reason: Reason | null;
        output: string;
        error: string;
        time: number;
    }

    /**
     * The events of a command: a line of stdout, a line of stderr, both carrying the ordinal of the
     * instruction they belong to, and the single verdict that settles it.
     */
    export type EventMap = {
        log: [message: string, ordinal: number];
        err: [message: string, ordinal: number];
        end: [verdict: Verdict];
    };
}

export default Command;

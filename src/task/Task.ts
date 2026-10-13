/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Runs the instructions of a task in sequence over a working directory, owning the single
 *              verdict of the run and reporting its progress.
 * @license Apache-2.0
 */
import { Events } from "@netfeez/common";

import Command from "./Command.js";

export class Task extends Events<Task.EventMap> {
    protected vResults: Task.commandResult[] = [];

    protected vCurrentStep: number = 0;
    protected vTotalTime: number = 0;

    protected vIsFinished: boolean = false;
    protected vIsRunning: boolean = false;
    protected vIsStopped: boolean = false;
    protected vReason: Task.Reason | null = null;

    /** The shell the scripts are written to, created only when an instruction needs one. */
    protected shell: Command.Shell | null = null;

    /** The handshake that silences the shell, awaited before the first instruction is written to it. */
    protected prepared: Promise<void> | null = null;

    /** The instruction in flight, the only one a timeout or a stop has to take down. */
    protected current: Command | null = null;

    protected timer: NodeJS.Timeout | null = null;

    public constructor(
        protected readonly cwd: string,
        protected readonly instructions: Task.Instruction[],
        protected readonly options: Task.Options = {}
    ) { super(); }

    public get currentStep(): number { return this.vCurrentStep; }
    public get isFinished(): boolean { return this.vIsFinished; }
    public get isRunning(): boolean { return this.vIsRunning; }
    public get completes(): number { return this.vResults.length; }
    public get totalTime(): number { return this.vTotalTime; }
    public get successes(): number { return this.vResults.filter(r => r.success).length; }
    public get results(): Task.commandResult[] { return this.vResults; }
    public get fails(): number { return this.vResults.filter(r => !r.success).length; }

    /**
     * Runs every instruction in sequence and settles the verdict of the task.
     * @returns A promise resolving with the summary of the run, or rejecting with a
     * {@link Task.Failure} carrying it, when the task failed and does not tolerate failures.
     *
     * @remarks This promise is the only verdict of the run: the `finish` event carries the same summary
     * for reporting, and nothing is decided by it.
     *
     * The failure of an instruction does not stop the task, so the remaining instructions still run, and
     * `allowFails` tolerates it. Anything else does stop the task, tolerating nothing, because none of
     * them is the failure of a command: a run that timed out, was stopped, could not start a program or
     * lost its shell did not do what it was asked to do, and `success: false` is not a verdict a caller
     * can act on.
     *
     * @example
     * ```ts
     * const task = new Task(cwd, [ { executable: 'git', args: ['clone', repo, folder] } ], { maxTimeMs: 30000 });
     * task.on('line', (line) => logger.info(line));
     * const outcome = await task.run();
     * ```
     */
    public async run(): Promise<Task.FinishData> {
        if (this.vIsFinished) throw new Error('Task has already run.');
        if (this.vIsRunning) throw new Error('Task is already running.');

        this.vIsRunning = true;
        this.arm();
        try {
            for (const instruction of this.instructions) {
                if (this.vIsStopped) break;
                this.vCurrentStep += 1;

                const result = await this.execute(instruction);
                this.vResults.push(result);
                this.vTotalTime += result.time;

                if (result.success) this.emit('step', result, this.vCurrentStep, result.time);
                else this.emit('error', result, this.vCurrentStep, result.time);

                if (result.reason && result.reason !== 'stopped') this.vReason = result.reason;
                if (result.reason) break;
            }

            const summary = this.getSummary();
            if (this.vIsStopped) throw new Task.Failure(summary, 'stopped');
            if (this.vReason !== null) throw new Task.Failure(summary, this.vReason);
            if (summary.fails > 0 && !this.options.allowFails) throw new Task.Failure(summary, 'command');
            return summary;
        } finally {
            this.vIsRunning = false;
            this.vIsFinished = true;
            this.disarm();
            this.dispose();
            this.emit('finish', this.getSummary());
        }
    }

    /**
     * Stops the task, taking down the instruction in flight, if any.
     * @returns void
     *
     * @remarks The pending run rejects with a {@link Task.Failure} of reason `stopped`, so a caller
     * that stops a task never waits for a verdict that will not come.
     */
    public stop(): void {
        if (this.vIsFinished) return;
        this.vIsStopped = true;
        this.current?.kill('stopped');
    }

    /**
     * Runs one instruction and turns its verdict into a result of the task.
     * @param instruction - The instruction to run, a script for the shell or a program of its own.
     * @returns A promise resolving with the result of the instruction.
     **/
    protected async execute(instruction: Task.Instruction): Promise<Task.commandResult> {
        const ordinal = this.vCurrentStep;
        const command = typeof instruction === 'string'
            ? Command.inShell(await this.getShell(), instruction, ordinal)
            : Command.asProgram({ cwd: this.cwd, ...instruction }, ordinal);

        this.current = command;
        if (this.vIsStopped) command.kill('stopped');

        return new Promise((resolve) => {
            command.on('log', (line, step) => this.emit('line', line, step));
            command.on('err', (line, step) => this.emit('err', line, step));
            command.once('end', (verdict) => {
                if (this.current === command) this.current = null;
                resolve(Task.result(command.label, verdict, ordinal));
            });
            command.exec();
        });
    }

    /**
     * The shell the scripts of this task are written to, started in the working directory of the task.
     * @returns A promise resolving to the shell, or to `null` when the shell of the task is already gone.
     *
     * @remarks The shell is silenced before it is handed over: everything it writes about itself belongs
     * to the shell and not to the first instruction, so the handshake that removes it completes first.
     *
     * @remarks A shell that dies takes down the instruction reading it, and the reason of the run becomes
     * `shell`: the instruction is reported as unfinished because there is no longer anything reading it,
     * and it is the task that owns the shell that says the shell is gone.
     */
    protected async getShell(): Promise<Command.Shell | null> {
        if (!this.shell) {
            this.shell = Command.createShell(this.cwd);
            this.shell.stdin.on('error', () => { });
            this.shell.once('error', () => { this.current?.kill('shell'); });
            this.shell.once('exit', () => { this.current?.kill('shell'); });
            this.prepared = Command.prepare(this.shell);
        }

        await this.prepared;
        return this.shell.exitCode === null && this.shell.signalCode === null ? this.shell : null;
    }

    /**
     * Arms the deadline of the task, taken from the time it started.
     * @returns void
     **/
    protected arm(): void {
        const limit = this.options.maxTimeMs ?? -1;
        if (limit < 0) return;
        this.timer = setTimeout(() => {
            this.vReason = 'timeout';
            this.current?.kill('timeout');
        }, limit);
        this.timer.unref();
    }

    /** Disarms the deadline of the task. **/
    protected disarm(): void {
        if (!this.timer) return;
        clearTimeout(this.timer);
        this.timer = null;
    }

    /** Takes down the shell of the task, if it created one. **/
    protected dispose(): void {
        this.current = null;
        this.prepared = null;
        if (!this.shell) return;
        Command.terminate(this.shell);
        this.shell = null;
    }

    /**
     * Turns the verdict of an instruction into the result the task keeps: the identity of the command,
     * the verdict itself, the output it produced and the diagnostic that explains how it ended.
     *
     * @remarks The output and the error are kept whole, so a caller can show them, save them or search
     * them without a policy having to be present while the command runs. Nothing is added to either
     * buffer, and the diagnostic never carries them: it says what happened, and the buffers say why.
     *
     * @param label - The human readable form of the instruction.
     * @param verdict - The verdict the command settled with.
     * @param ordinal - The position of the instruction inside the task, starting at 1.
     * @returns The result of the instruction.
     **/
    protected static result(label: string, verdict: Command.Verdict, ordinal: number): Task.commandResult {
        return {
            ordinal,
            label,
            success: verdict.code === 0 && verdict.reason === null,
            code: verdict.code,
            signal: verdict.signal,
            reason: verdict.reason,
            time: verdict.time,
            stdout: verdict.output,
            stderr: verdict.error,
            diagnostic: Task.diagnostic(label, verdict)
        };
    }

    /**
     * The one line that explains how an instruction ended, the same in every mode and the only text
     * about the failure that belongs to the result.
     *
     * @remarks A command that failed carries its status, its signal or the reason it could not finish,
     * and never its output: mixing both made the first line of a failure unreadable, and the output is
     * already in the buffers, in the evidence file and, when it is wanted, right under this line.
     *
     * @param label - The human readable form of the instruction.
     * @param verdict - The verdict the command settled with.
     * @returns The diagnostic of the instruction, empty when it succeeded.
     **/
    protected static diagnostic(label: string, verdict: Command.Verdict): string {
        if (verdict.reason === 'timeout') return `Instruction timed out: ${label}`;
        if (verdict.reason === 'stopped') return `Instruction stopped: ${label}`;
        if (verdict.reason === 'shell') return `The shell exited before the instruction finished: ${label}`;
        if (verdict.reason === 'spawn') return `Instruction could not be started: ${label}`;
        if (verdict.reason === 'protocol') return `The shell did not report the status of: ${label}`;
        if (verdict.reason !== null || verdict.code === 0) return '';

        return verdict.signal
            ? `Command failed with signal ${verdict.signal}: ${label}`
            : `Command failed with status ${verdict.code}: ${label}`;
    }

    /**
     * The summary of the task execution, which is both the verdict of the run and what the `finish`
     * event reports.
     * @returns The summary of the execution.
     **/
    protected getSummary(): Task.FinishData {
        return {
            success: this.vReason === null && (this.fails === 0 || this.options.allowFails === true),
            completes: this.completes,
            fails: this.fails,
            totalTime: this.totalTime,
            results: this.results
        };
    }
}
export namespace Task {
    export type Emitter = Events.Emitter<EventMap>;
    export type Program = Command.Program;
    export type Instruction = string | Program;
    export type Reason = Command.Reason;

    export interface Options {
        /** The deadline of the whole task in milliseconds; a negative value leaves it unbounded. */
        maxTimeMs?: number;
        /** Whether the failure of an instruction is tolerated, so the task still succeeds. */
        allowFails?: boolean;
    }

    /**
     * The events of a task: a line of stdout, a line of stderr, the result of the instruction that just
     * ended, and the summary of the run.
     *
     * @remarks Every line and every result carries the ordinal of the instruction it belongs to, the one
     * the command already knows, so a consumer can attribute both without keeping a counter of its own.
     */
    export type EventMap = {
        line: [line: string, ordinal: number];
        err: [line: string, ordinal: number];
        step: [commandResult: commandResult, step: number, time: number];
        error: [commandResult: commandResult, step: number, time: number];
        finish: [data: FinishData];
    }

    /**
     * Everything a task knows about one instruction: who it was, how it ended, and everything it said.
     */
    export interface commandResult {
        /** The position of the instruction inside its task, starting at 1. */
        ordinal: number;
        /** The human readable form of the instruction, whole, as it was given. */
        label: string;
        /** Whether the instruction ended as it was asked to. */
        success: boolean;
        /** The exit status, or `null` when there was none. */
        code: number | null;
        /** The signal that took the command down, or `null` when there was none. */
        signal: NodeJS.Signals | null;
        /** Why there is no status at all, or `null` when the command reported one. */
        reason: Reason | null;
        /** The time the instruction took, in milliseconds. */
        time: number;
        /** Everything the instruction wrote to stdout. */
        stdout: string;
        /** Everything the instruction wrote to stderr. */
        stderr: string;
        /** The one line that explains a failure, empty when the instruction succeeded. */
        diagnostic: string;
    }

    export interface FinishData {
        success: boolean;
        completes: number;
        fails: number;
        totalTime: number;
        results: commandResult[];
    }

    /**
     * The failure of a task, carrying the summary of the run that produced it.
     *
     * @remarks The message says how the task failed and nothing more. The output of every instruction is
     * in the summary, one result per command, and printing it here duplicated it in every message a
     * caller logged: a task that printed a build log threw the log away once per layer that reported it.
     */
    export class Failure extends Error {
        /**
         * Creates the failure of a task.
         * @param outcome - The summary of the run.
         * @param reason - Why the task failed.
         */
        public constructor(public readonly outcome: FinishData, public readonly reason: Reason | 'command' = 'command') {
            super(Failure.message(outcome, reason));
            this.name = 'Task.Failure';
        }

        /**
         * The message describing why a task failed: how many instructions failed, and why the run did not
         * get to all of them.
         * @param outcome - The summary of the run.
         * @param reason - Why the task failed.
         * @returns The message of the failure.
         **/
        private static message(outcome: FinishData, reason: Reason | 'command'): string {
            const lines: string[] = [];
            if (outcome.fails > 0) lines.push(`Task failed with ${outcome.fails} failed instruction(s).`);

            if (reason === 'timeout') lines.push('Task timed out before completing every instruction.');
            else if (reason === 'stopped') lines.push('Task was stopped before completing every instruction.');
            else if (reason === 'shell') lines.push('The shell running the task exited unexpectedly.');
            else if (reason === 'spawn') lines.push('An instruction could not be started.');
            else if (reason === 'protocol') lines.push('The shell did not report the status of an instruction.');
            return lines.join('\n');
        }
    }
}
export default Task;

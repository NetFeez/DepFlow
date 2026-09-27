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
    protected vShellError: string | null = null;

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
    public get errors(): string[] { return this.vResults.filter(r => !r.success).map(r => r.result); }
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

                if (result.success) this.emit('step', result.result, this.vCurrentStep, result.time);
                else this.emit('error', result.result, this.vCurrentStep, result.time);

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
        const command = typeof instruction === 'string'
            ? Command.inShell(await this.getShell(), instruction)
            : Command.asProgram({ cwd: this.cwd, ...instruction });

        this.current = command;
        if (this.vIsStopped) command.kill('stopped');

        return new Promise((resolve) => {
            command.on('log', (line) => this.emit('line', line));
            command.on('err', (line) => this.emit('err', line));
            command.once('end', (verdict) => {
                if (this.current === command) this.current = null;
                const result = Task.result(command.label, verdict);
                if (result.reason === 'shell' && this.vShellError) result.result += `\n${this.vShellError}`;
                resolve(result);
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
     */
    protected async getShell(): Promise<Command.Shell | null> {
        if (!this.shell) {
            this.shell = Command.createShell(this.cwd);
            this.shell.stdin.on('error', () => { });
            this.shell.once('error', (error: Error) => {
                this.vShellError = error.message;
                this.current?.kill('shell');
            });
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
     * Turns the verdict of an instruction into the result the task keeps, describing the instruction
     * and its failure in the one message a caller gets.
     * @param label - The human readable form of the instruction.
     * @param verdict - The verdict the command settled with.
     * @returns The result of the instruction.
     **/
    protected static result(label: string, verdict: Command.Verdict): Task.commandResult {
        const success = verdict.code === 0 && verdict.reason === null;
        return {
            success,
            result: Task.message(label, verdict),
            time: verdict.time,
            code: verdict.code,
            signal: verdict.signal,
            reason: verdict.reason,
            stderr: verdict.error
        };
    }

    /**
     * The message that describes an instruction and how it ended.
     * @param label - The human readable form of the instruction.
     * @param verdict - The verdict the command settled with.
     * @returns The message of the instruction, empty when it produced no output and succeeded.
     **/
    protected static message(label: string, verdict: Command.Verdict): string {
        if (verdict.reason === null && verdict.code === 0) return verdict.output;
        if (verdict.reason === 'timeout') return `Instruction timed out: ${label}`;
        if (verdict.reason === 'stopped') return `Instruction stopped: ${label}`;
        if (verdict.reason === 'shell') return `The shell exited before the instruction finished: ${label}`;
        if (verdict.reason === 'spawn') return `Instruction could not be started: ${label}`;
        if (verdict.reason === 'protocol') return `The shell did not report the status of: ${label}`;

        const failure = verdict.signal
            ? `Command failed with signal ${verdict.signal}: ${label}`
            : `Command failed with status ${verdict.code}: ${label}`;
        return verdict.error ? `${failure}\n${verdict.error}` : failure;
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
            results: this.results,
            errors: this.errors
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

    export type EventMap = {
        line: [line: string];
        err: [line: string];
        step: [result: string, step: number, time: number ];
        error: [error: string, step: number, time: number];
        finish: [data: FinishData];
    }

    export interface commandResult {
        success: boolean;
        result: string;
        time: number;
        code: number | null;
        signal: NodeJS.Signals | null;
        reason: Reason | null;
        stderr: string;
    }

    export interface FinishData {
        success: boolean;
        completes: number;
        fails: number;
        totalTime: number;
        results: commandResult[];
        errors: string[];
    }

    /**
     * The failure of a task, carrying the summary of the run that produced it.
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
         * The message describing why a task failed, and every failure it collected on the way.
         * @param outcome - The summary of the run.
         * @param reason - Why the task failed.
         * @returns The message of the failure.
         **/
        private static message(outcome: FinishData, reason: Reason | 'command'): string {
            const lines: string[] = [];
            if (reason === 'timeout') lines.push('Task timed out before completing every instruction.');
            else if (reason === 'stopped') lines.push('Task was stopped before completing every instruction.');
            else if (reason === 'shell') lines.push('The shell running the task exited unexpectedly.');
            else if (reason === 'spawn') lines.push('An instruction could not be started.');
            else if (reason === 'protocol') lines.push('The shell did not report the status of an instruction.');
            else lines.push(`Task failed with ${outcome.fails} failed instruction(s).`);

            if (outcome.errors.length > 0) lines.push('Errors:', ...outcome.errors);
            return lines.join('\n');
        }
    }
}
export default Task;

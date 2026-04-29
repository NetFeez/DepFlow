import { ChildProcessWithoutNullStreams } from "node:child_process";

import { Events } from "@netfeez/common";

import Command from "./Command.js";
import Async from "../Async.js";

export class Task extends Events<Task.EventMap> implements Task.FinishData {
    protected vResults: Task.commandResult[] = [];

    protected vFails: number = 0;
    protected vSuccesses: number = 0;
    protected vCurrentStep: number = 0;
    protected vTotalTime: number = 0;
    
    protected vIsFinished: boolean = false;
    protected vIsRunning: boolean = false;
    
    protected shellComponents: Command.ShellComponents | null = null;

    public constructor(
        protected readonly cwd: string,
        protected readonly commands: string[]
    ) { super(); }

    public get currentStep(): number { return this.vCurrentStep; }
    public get isFinished(): boolean { return this.vIsFinished; }
    public get completes(): number { return this.vResults.length; }
    public get totalTime(): number { return this.vTotalTime; }
    public get successes(): number { return this.vResults.filter(r => r.success).length; }
    public get results(): Task.commandResult[] { return this.vResults; }
    public get errors(): string[] { return this.vResults.filter(r => !r.success).map(r => r.result); }
    public get fails(): number { return this.vResults.filter(r => !r.success).length; }

    /**
     * Stops the execution of the task immediately, aborting any active command and marking the task as finished.
     * It emits a 'finish' event with the current summary data, allowing consumers of the Task class to access the results and errors collected up to the point of stopping.
     * This method is essential for providing a way to gracefully terminate a task that may be taking too long or encountering issues, ensuring that resources are properly released and that the task's state is accurately reflected as finished.
     * It also allows for external control over the task execution, enabling users to stop the task based on certain conditions or user input without having to wait for all commands to complete.
     * @returns void
     */
    public stop(): void {
        if (this.vIsFinished) return;
        if (!this.shellComponents) return;
        this.cleanup();
        this.vIsFinished = true;
    }
    /**
     * Starts the execution of the task by running each command in sequence using the provided shell instance.
     * It captures the output and errors of each command, emitting events for each line of output, each step completion, and any errors encountered.
     * The method also tracks the execution time for each command and compiles a summary of the task's performance once all commands have been executed.
     * If any command fails, it continues executing the remaining commands but records the failure in the summary data.
     * Once all commands have been processed, it emits a 'finish' event with the compiled summary data, allowing consumers of the Task class to access detailed information about the execution outcomes.
     * @returns A promise that resolves when all commands have been executed and the 'finish' event has been emitted, providing a comprehensive summary of the task execution.
     * @throws Will throw an error if the task has already finished or if there is no shell available to execute the commands.
     */
    public async start(): Promise<void> {
        if (this.vIsFinished) throw new Error("Task has already finished.");
        if (this.vIsRunning) throw new Error("Task is already running.");

        this.vIsRunning = true;

        this.shellComponents = await Command.createShell();
        const { shell, abort } = this.shellComponents;
        try {
            const cdRS = await this.runCommand(shell, `cd ${this.cwd}`);
            if (!cdRS.success) throw new Error(`Failed to change directory to ${this.cwd}: ${cdRS.result}`);
            for (const command of this.commands) {
                if (this.vIsFinished) break;
                this.vCurrentStep += 1;
                const result = await this.runCommand(shell, command);
                this.vResults.push(result);
                this.vTotalTime += result.time;

                if (result.success) this.emit('step', result.result, this.vCurrentStep, result.time);
                else this.emit('error', result.result, this.vCurrentStep, result.time);
            }
        } finally {
            this.vIsFinished = true;
            this.vIsRunning = false;
            this.cleanup();
            this.emit('finish', this.getSummary());
        }
    }
    protected cleanup(): void {
        if (this.shellComponents && this.vIsRunning) {
            this.shellComponents.abort();
            this.shellComponents = null;
        } else {
            this.shellComponents?.shell.kill();
            this.shellComponents = null;
        }
    }
    /**
     * Generates a summary of the task execution, including the number of completed steps, failed steps, total execution time, results, and errors.
     * This method is called when the task finishes to compile the final data that will be emitted with the 'finish' event.
     * It provides a comprehensive overview of the task's performance and outcomes, allowing consumers of the Task class to easily access and utilize this information for reporting, logging, or further processing.
     * @returns An object containing the summary data of the task execution, structured according to the Task.FinishData interface.
     */
    private getSummary(): Task.FinishData {
        return {
            completes: this.completes,
            fails: this.fails,
            totalTime: this.totalTime,
            results: this.results,
            errors: this.errors
        };
    }
    /**
     * Executes a single shell command in the provided child process, capturing its output and handling errors.
     * It writes the command to the child process's stdin and listens for output on stdout and stderr.
     * The method uses a unique marker to determine when the command has finished executing, allowing it to capture the complete output before resolving.
     * If an error occurs during execution, it captures the error message and rejects the promise with a descriptive error.
     * This function is essential for running individual build commands as part of the dependency installation process, providing detailed feedback on the execution of each command and ensuring that any issues are properly handled and reported.
     * @param shell The child process in which to execute the command.
     * @param cmd The shell command to execute.
     * @returns A promise that resolves to an array of string messages indicating the result of the command execution, including any output captured during the process.
     * @throws Will throw an error if the command fails to execute properly, providing details about the failed command and the associated error message.
     */
    protected async runCommand(shell: Command.Shell, cmd: string): Promise<Task.commandResult> {
        const startTime = Date.now();

        try {
            const result = await Async.awaitEvent<string>((done, fail) => {
                const command = new Command(shell, cmd);

                command.on('log', (msg) => this.emit('line', msg));
                command.on('err', (msg) => this.emit('line', msg));

                command.once('end', (status, msg) => {
                    if (status === 0) done(msg);
                    else fail(new Error(`Command failed with status ${status}`));
                });
                command.exec();
                return () => { this.stop(); };
            });

            return { success: true, result, time: Date.now() - startTime };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return { success: false, result: errorMsg, time: Date.now() - startTime };
        }
    }
}
export namespace Task {
    export type Emitter = Events.Emitter<EventMap>;
    export type InternalEmitter = Events.Emitter<EventMap>;
    export type EventMap = {
        line: [line: string];
        step: [result: string, step: number, time: number ];
        error: [error: string, step: number, time: number];
        finish: [data: FinishData];
    }
    
    export interface commandResult {
        success: boolean;
        result: string;
        time: number;
    }
    export interface FinishData {
        completes: number;
        fails: number;
        totalTime: number;
        results: commandResult[];
        errors: string[];
    }
}
export default Task;
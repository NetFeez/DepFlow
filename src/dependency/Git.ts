/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Runs git clone and pull operations as programs of their own, with real-time logging.
 * @license Apache-2.0
 */
import type Logger from "@netfeez/vterm";

import Task from "../task/Task.js";

import Dependency from './Dependency.js';

export class Git {
    /**
     * Clones a Git repository from the specified URL to the target path, optionally checking out a
     * specific tag after cloning.
     * The repository, the path and the tag are passed as arguments of `git`, never as a script, so
     * nothing in them can be reinterpreted as another command.
     * @param repo - The URL of the Git repository to clone.
     * @param path - The file system path where the repository should be cloned to.
     * @param options - An object containing optional parameters for the clone operation, including:
     *   - tag: An optional Git tag to check out after cloning the repository.
     *   - logger: An optional Logger instance for real-time logging of command output and errors.
     *   - cwd: An optional current working directory to execute the commands from, defaulting to the process's current working directory if not provided.
     */
    public static async clone(repo: string, path: string, options: Git.RepoOptions): Promise<void> {
        const { tag, logger, cwd = process.cwd() } = options;
        const instructions: Task.Instruction[] = [
            { executable: 'git', args: [ 'clone', repo, path ], cwd }
        ];
        if (tag) instructions.push({ executable: 'git', args: [ 'checkout', tag ], cwd: path });
        await this.runTask(instructions, { cwd, logger }, 'clone');
    }
    /**
     * Brings an existing checkout of a repository to the revision that was asked for.
     *
     * The objects are fetched first, always, and then the revision is checked out: a tag is a
     * revision, not a branch, so a checkout that already sits on one has a detached HEAD, where
     * `git pull` has nothing to pull into and fails. Checking out the requested revision lands on the
     * very same commit a fresh clone of that revision would.
     * @param path - The file system path to the local Git repository to bring up to date.
     * @param options - An object containing optional parameters for the pull operation, including:
     *   - tag: An optional Git tag to check out, or the branch to fast forward when it is absent.
     *   - logger: An optional Logger instance for real-time logging of command output and errors.
     *   - cwd: An optional current working directory to execute the commands from, defaulting to the process's current working directory if not provided.
     */
    public static async pull(path: string, options: Git.RepoOptions): Promise<void> {
        const { tag, logger } = options;
        const instructions: Task.Instruction[] = [
            { executable: 'git', args: [ 'fetch', '--tags', '--force' ], cwd: path }
        ];
        instructions.push(tag
            ? { executable: 'git', args: [ 'checkout', tag ], cwd: path }
            : { executable: 'git', args: [ 'pull', '--ff-only' ], cwd: path });
        await this.runTask(instructions, { logger }, 'pull');
    }
    /**
     * Runs the instructions of a Git operation as a Task, reporting their output as it comes.
     * The verdict of the task is the verdict of the operation: it is awaited, never read from an event.
     * @param instructions - The git instructions to run.
     * @param options - An object containing optional parameters for the operation, including:
     *   - logger: An optional Logger instance for real-time logging of command output and errors.
     *   - cwd: The working directory of the task, defaulting to the process's current working directory.
     * @param operation - The name of the operation, used to describe it when it fails.
     * @returns A promise resolving once every instruction ran.
     * @throws { Task.Failure } When any of the instructions fails.
     */
    protected static async runTask(instructions: Task.Instruction[], options: Git.ShellOptions, operation: string): Promise<void> {
        const { cwd = process.cwd(), logger } = options;
        const task = new Task(cwd, instructions, { maxTimeMs: Dependency.ACQUISITION_TIME_MS });
        if (logger) Git.report(task, logger, operation);
        await task.run();
    }
    /**
     * Wires the progress of a task to a logger.
     * @param task - The task to report.
     * @param logger - The logger that receives the output of the task.
     * @param operation - The name of the operation, used to label the steps of the task.
     * @returns void
     **/
    private static report(task: Task, logger: Logger, operation: string): void {
        task.on('line', (line) => logger.info(line));
        task.on('err', (line) => logger.error(line));
        task.on('error', (message, step) => { logger.error(`&C6[${operation} step ${step}]&C7: &C1${message}`); });
    }
}
export namespace Git {
    export interface ShellOptions {
        cwd?: string;
        logger?: Logger;
    }
    export interface RepoOptions extends ShellOptions {
        tag?: string;
    }
}
export default Git;

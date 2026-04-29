import Task from "./Task/Task.js";
import Async from "./Async.js";
import Logger from "@netfeez/vterm";

export class Git {
    protected logger: Logger | null;
    protected cwd: string;
    public constructor(
        protected path: string,
        protected repo: string,
        options: Git.RepoOptions
    ) {
        const { logger, cwd } = options;
        this.logger = logger || null;
        this.cwd = cwd || process.cwd();
    }
    /**
     * Clones a Git repository from the specified URL to the target path, optionally checking out a specific tag after cloning.
     * The method constructs the necessary commands to perform the clone operation and optionally check out a specified tag, then initiates a Task to execute these commands sequentially.
     * It listens for 'line' events to log standard output and 'error' events to log any errors that occur during command execution, including the step at which the error occurred.
     * Once all commands have been executed,
     * it listens for the 'finish' event to determine the overall success of the operation, logging a summary of the results and resolving or rejecting the promise accordingly based on whether any steps failed.
     * @param repo The URL of the Git repository to clone.
     * @param path The file system path where the repository should be cloned to.
     * @param options An object containing optional parameters for the clone operation, including:
     *   - tag: An optional Git tag to check out after cloning the repository.
     *   - logger: An optional Logger instance for real-time logging of command output and errors.
     *   - cwd: An optional current working directory to execute the commands from, defaulting to the process's current working directory if not provided.
     */
    public static async clone(repo: string, path: string, options: Git.RepoOptions): Promise<void> {
        const { tag, logger, cwd = process.cwd() } = options;
        const commands = [
            `git clone ${repo} ${path}`,
            `cd ${path}`,
        ];
        if (tag) commands.push(`git checkout ${tag}`);
        await this.runTask(commands, { cwd, logger });
    }
    /**
     * Performs a 'git pull' operation on the specified repository path, optionally checking out a specific tag after pulling the latest changes.
     * The method constructs the necessary commands to navigate to the repository path, execute the pull operation, and optionally check out a specified tag.
     * It then initiates a Task to execute these commands sequentially, providing real-time logging and error handling through the provided Logger instance.
     * The method listens for 'line' events to log standard output and 'error' events to log any errors that occur during command execution, including the step at which the error occurred.
     * Once all commands have been executed, it listens for the 'finish' event to determine the overall success of the operation, logging a summary of the results and resolving or rejecting the promise accordingly based on whether any steps failed.
     * @param path The file system path to the local Git repository where the pull operation should be performed.
     * @param options An object containing optional parameters for the pull operation, including:
     *   - tag: An optional Git tag to check out after pulling the latest changes.
     *   - logger: An optional Logger instance for real-time logging of command output and errors.
     *   - cwd: An optional current working directory to execute the commands from, defaulting to the process's current working directory if not provided.
     */
    public static async pull(path: string, options: Git.RepoOptions): Promise<void> {
        const { tag, logger, cwd = process.cwd() } = options;
        const commands = [
            `cd ${path}`,
            `git pull`
        ];
        if (tag) commands.push(`git checkout ${tag}`);
        await this.runTask(commands, { cwd, logger });
    }
    /**
     * Executes a series of Git commands as a Task, providing real-time logging and error handling through the provided Logger instance.
     * The method constructs the necessary commands based on the provided repository URL, target path, and optional tag, then initiates a Task to execute these commands sequentially.
     * It listens for 'line' events to log standard output and 'error' events to log any errors that occur during command execution, including the step at which the error occurred.
     * Once all commands have been executed, it listens for the 'finish' event to determine the overall success of the operation, logging a summary of the results and resolving or rejecting the promise accordingly based on whether any steps failed.
     */
    protected static async runTask(commands: string[], options: Git.ShellOptions): Promise<Task.FinishData> {
        const { cwd = process.cwd(), logger } = options;
        return Async.awaitEvent<Task.FinishData>((done, fail) => {
            const task = new Task(cwd, commands);
            if (logger) {
                task.on('line', logger.info.bind(logger));
                task.on('error', (msg, step) => {
                    logger.error(`&C6[Step ${step}]&C7: &C1${msg}`);
                });
            }
            task.once('finish', (summary) => {
                if (summary.fails > 0) {
                    if (logger) logger.error(`&C1Git clone completed with ${summary.fails} failed steps in ${summary.totalTime}ms.`);
                    fail(new Error(`Git clone failed with ${summary.fails} failed steps.\nErrors:\n${summary.errors.join('\n')}`));
                } else {
                    if (logger) logger.info(`&C2Git clone completed successfully in ${summary.totalTime}ms with ${summary.completes} steps.`);
                    done(summary);
                }
            });
            task.start().catch(fail);
            return () => { task.stop(); };
        });
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
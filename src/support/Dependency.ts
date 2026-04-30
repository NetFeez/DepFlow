/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Dependency utility.
 * @license Apache-2.0
 */
import { promises as FS } from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

import { File, Path } from '@netfeez/common-node';
import Logger from "@netfeez/vterm";

import schemas from "../config/schemas.js";
import Validator from "./Validator.js";
import Config from "../config/Config.js";
import Git from "./Git.js";
import Async from "./Async.js";
import Task from "./Task/Task.js";
import Utils from "./Utils.js";

export class Dependency implements Dependency.Dependency {
    public static include: string[] = [ '*' ];
    public readonly name: string;
    public readonly repo: Dependency.repo;
    public readonly tag?: string;
    public readonly builder: Dependency.Builder[];
    public readonly resolver: Dependency.Resolver[];

    public constructor(
        protected readonly config: Config.Config,
        dependency: Dependency.Dependency,
        protected logger: Logger
    ) {
        Validator.validateRepo(dependency.repo);
        this.name = dependency.name;
        this.repo = dependency.repo;
        this.tag = dependency.tag;
        this.builder = dependency.builder;
        this.resolver = dependency.resolver || [];
    }
    /** Get the folder of the dependency */
    public get folder(): string {
        let path = Path.join(this.config.flowFolder, this.name);
        path = Path.normalize(path);
        return path;
    }
    /**
     * Updates the local repository of the dependency by either cloning it if it does not exist or pulling the latest changes if it already exists. It checks for the existence of the dependency's folder and performs the appropriate Git operations, providing logging throughout the process to indicate the status of the operations. This method ensures that the local copy of the dependency is up-to-date with its remote repository, allowing for a smooth installation and build process when managing dependencies in a project.
     * @returns A promise that resolves when the update process is complete, or rejects with an error if any step of the process fails, allowing callers to handle such scenarios appropriately.
     * @throws Will throw an error if any issues occur during the cloning or pulling process, such as problems with Git commands or file system access.
     */
    protected async update(): Promise<void> {
        if (this.logger) this.logger.group(Utils.newGroup('#00B4FF'));
        if (await File.exists(this.folder)) {
            this.logger.log(`&C3Repository already exists, pulling latest changes...`);
            await Git.pull(this.folder, { logger: this.logger });
            this.logger.log(`&C2Pull completed successfully.`);
        } else {
            this.logger.log(`&C5Cloning repository from &C6${this.repo}&C5...`);
            await Git.clone(this.repo, this.folder, { tag: this.tag, logger: this.logger });
            this.logger.log(`&C2Clone completed successfully.`);
        }
        if (this.logger) this.logger.groupEnd();
    }
    /**
     * Installs the dependency by first cloning its repository (or pulling updates if it already exists) and then executing any build steps defined in the builder property. It manages the entire installation process, including handling the cloning/pulling of the repository and running any necessary commands to set up the dependency according to its configuration. This method ensures that the dependency is properly installed and ready for use, providing feedback on each step of the process through returned messages.
     * @returns A promise that resolves to an array of string messages indicating the results of the cloning/pulling and building processes.
     * @throws Will throw an error if any step of the installation process fails, such as issues with cloning, pulling, or executing build commands.
     */
    public async install(): Promise<void> {
        try {
            await this.update();
            await this.build();
        } catch (error) { throw error; }
    }
    /**
     * Uninstalls the dependency by removing its local folder and any additional folders specified in the builder's move steps.
     * It checks for the existence of each folder before attempting to remove it, ensuring that it only tries to delete valid paths.
     * This method is crucial for cleanly removing a dependency from the local file system, allowing for a complete uninstallation that includes all related files and directories as defined by the dependency's configuration.
     * @return A promise that resolves to an array of string messages indicating the results of the uninstallation process, such as which folders were removed.
     * @throws Will throw an error if any issues occur during the uninstallation process, such as problems with file system access or if the specified folders cannot be removed.
     */
    public async uninstall(): Promise<void> {
        try {
            const moves: string[] = this.builder
                ? this.builder
                    .map(step => step.move ? Dependency.getAllOutFolders(step.move) : [])
                    .reduce((acc, val) => acc.concat(val), [])
                : [];

            const folders: string[] = [ this.folder, ...moves ];

            for (const folder of folders) {
                if (!await File.exists(folder)) continue;
                if (this.logger) this.logger.log(`&R[${this.name}] &GRemoving folder: &C4${folder}`);
                await FS.rm(folder, { recursive: true });
            }
        } catch (error) { throw error; }
    }
    /**
     * Builds the dependency by executing the commands specified in the builder property.
     * It iterates through each build step, running any defined commands and handling file movements as necessary.
     * The method uses a child process to execute shell commands, capturing the output and errors for each step.
     * This allows for a flexible build process that can accommodate various setup requirements defined by the dependency's configuration, ensuring that the dependency is properly built and ready for use after installation.
     * @return A promise that resolves to an array of string messages indicating the results of the build process, including any command outputs and file movements.
     * @throws Will throw an error if any issues occur during the build process, such as command execution failures or problems with file movements.
     */
    protected async build(): Promise<boolean> {
        if (!this.builder || this.builder.length === 0) return true;
        try {
            if (this.logger) this.logger.group(Utils.newGroup('#00f048'));
            
            for (const step of this.builder) {
                if (step.run) {
                    if (this.logger) this.logger.info(`&C5Running command task...`);
                    const commands = Array.isArray(step.run) ? step.run : [ step.run ];
                    await this.runTask(commands, { logger: this.logger, maxTimeMs: step.maxTimeMs });
                }
                if (step.move) {
                    if (this.logger) {
                        if (step.run) this.logger.line();
                        this.logger.info(`&C5Running move task...`);
                    }
                    await this.move(step.move, this.logger);
                }
            }
        } catch(error) { if (this.logger) this.logger.error(`&C1Build failed: ${error}`); return false;}
        finally { if (this.logger) this.logger.groupEnd(); }
        return true;
    }
    /**
     * Runs a series of shell commands as part of the build process, using a child process to execute the commands and capturing the output for logging. It handles the execution of the commands, providing feedback on the progress and any errors that occur during the process. This method is essential for executing the necessary setup commands defined in the builder configuration, allowing for a flexible and dynamic build process that can accommodate various requirements for different dependencies.
     * @param commands An array of strings representing the shell commands to be executed as part of the build process.
     * @param logger An optional Logger instance for logging the output and errors from the command execution.
     * @returns A promise that resolves when the command execution is complete, or rejects with an error if any command fails, allowing callers to handle such scenarios appropriately.
     * @throws Will throw an error if any issues occur during the execution of the commands, such as problems with spawning the child process or if any command returns a non-zero exit code.
     */
    protected runTask(commands: string[], options: Dependency.taskOptions = {}): Promise<void> {
        const { logger, maxTimeMs } = options;
        return Async.awaitEvent<void>((done, fail) => {
            const pollito = new Task(this.folder, commands);
            if (logger) {
                pollito.on('line', (line) => logger.info(`${line}`));
                pollito.on('error', (msg, step) => logger.error(`&C1[Step ${step}]&C7: &C1${msg}`));
            }
            pollito.once('finish', (data) => {
                if (data.fails > 0) fail(new Error(`Build failed with ${data.fails} failed steps.`));
                else done();
            });
            pollito.start().catch(fail);
            return () => { pollito.stop(); };
        }, maxTimeMs);
    }
    /**
     * Handles the file movements defined in the builder's move steps.
     * It supports various formats for specifying destinations, including strings, arrays, and objects with keys representing source paths.
     * The method checks for the existence of source files or directories before attempting to move them to the specified destinations, ensuring that it only operates on valid paths.
     * This function is essential for managing the organization of files after building a dependency, allowing for flexible configurations that can accommodate different project structures and requirements.
     * @param move The move configuration from the builder, which can be a string, an array of strings, or an object mapping source paths to destination paths.
     * @returns A promise that resolves to an array of string messages indicating the results of the file movements, including any errors encountered during the process.
     * @throws Will throw an error if any issues occur during the file movement process, such as missing source paths or problems with file system access.
     */
    protected async move(move: Dependency.Builder['move'], logger: Logger): Promise<void> {
        if (!move) return;
        if (typeof move === 'string' || Array.isArray(move)) {
            const moves = Array.isArray(move) ? move : [ move ];
            for (const destination of moves) {
                await this.moveFiles(destination, undefined, logger);
            }
        } else {
            for (const key in move) {
                const value = move[key];
                const destinations = typeof value === 'string' ? [ value ] : value;
                for (const destination of destinations) {
                    await this.moveFiles(destination, key, logger);
                }
            }
        }
    }
    /**
     * Handles the file movements for a specific source and destination.
     * It checks for the existence of the source path and creates the destination folder if it does not exist.
     * The method uses fs.cp to copy files or directories from the source to the destination, supporting recursive copying for directories.
     * It captures any errors that occur during the process and provides descriptive error messages to help identify issues with file movements.
     * This function is crucial for managing the organization of files after building a dependency, allowing for flexible configurations that can accommodate different project structures and requirements.
     * @param destination The target path(s) where the source should be moved to.
     * @param source An optional specific source path within the dependency folder to move, defaulting to the entire folder if not provided.
     * @returns A promise that resolves to an array of string messages indicating the results of the file movements, including any errors encountered during the process.
     * @throws Will throw an error if any issues occur during the file movement process, such as missing source paths or problems with file system access.
     */
    protected async moveFiles(destination: string | string[], source?: string, logger?: Logger): Promise<void> {
        destination = Array.isArray(destination) ? destination : [ destination ];
        source = Dependency.getSourcePath(this.folder, source);
        for (const folder of destination) {
            try {
                if (!await File.exists(source)) throw new Error(`Source path ${source} does not exist.`);
                if (!await File.exists(folder)) {
                    if (!await File.isFile(source)) await FS.mkdir(folder, { recursive: true });
                    else {
                        const toCreate = folder.slice(0, folder.lastIndexOf('/'));
                        if (!await File.exists(toCreate)) await FS.mkdir(toCreate, { recursive: true });
                    }
                }
                if (logger) logger.info(`&RMoving source &C4${source} &Rto &C4${folder}`);
                await FS.cp(source, folder, { recursive: true, force: true });
            } catch (error) { throw new Error(`Failed to move files from ${this.name} to ${folder}, \n${error}`); }
        }
    }
    /**
     * Constructs the source path for file movements based on the dependency's folder and an optional specific source path.
     * If a specific source is provided, it concatenates it with the dependency's folder; otherwise, it returns the dependency's folder as the source path.
     * The method also ensures that any trailing slashes are removed from the folder and that any leading slashes are removed from the source to create a valid path for file operations.
     * This function is essential for determining the correct source path when moving files as part of the build process, allowing for flexible configurations that can specify either the entire dependency folder or specific subpaths within it.
     * @param folder The base folder of the dependency.
     * @param source An optional specific source path within the dependency folder to use for file movements.
     * @returns A string representing the constructed source path for file operations.
     */
    public static getSourcePath(folder: string, source?: string): string {
        folder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
        if (!source) return folder;
        source = source.startsWith('/') ? source.slice(1) : source;
        return `${folder}/${source}`.replace(/ /g, '\\ ');
    }
    /**
     * Recursively extracts all destination folders from the builder's move configuration, supporting various formats such as strings, arrays, and nested objects.
     * It traverses the move configuration, collecting all destination paths into a single array, which can then be used for file operations during the build process.
     * This method is crucial for managing the organization of files after building a dependency, allowing for flexible configurations that can accommodate different project structures and requirements.
     * @param builder The move configuration from the builder, which can be a string, an array of strings, or an object mapping source paths to destination paths.
     * @returns An array of strings representing all destination folders extracted from the move configuration.
     */
    public static getAllOutFolders(builder: Dependency.Builder['move']): string[] {
        if (!builder) return [];
        const folders: string[] = [];
        if (typeof builder === 'string') folders.push(builder);
        else if (Array.isArray(builder)) folders.push(...builder);
        else for (const key in builder) {
            const out = this.getAllOutFolders(builder[key]);
            folders.push(...out);
        } return folders;
    }
}

export namespace Dependency {
    export type logCallback = (messages: string[]) => void;
    export type repo = `https://github.com/${string}/${string}.git` | `git@github.com:${string}/${string}.git`;
    export type Builder = schemas.builder['infer'];
    export type Resolver = schemas.pathResolverEntry['infer'];
    export type Dependency = schemas.dependency['infer'];
    export type newDependency = schemas.dependency['inferToProcess'];
    export interface manageOptions { force?: boolean; }
    export interface taskOptions {
        logger?: Logger;
        maxTimeMs?: number;
    };
}

export default Dependency;

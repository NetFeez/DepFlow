/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Dependency utility.
 * @license Apache-2.0
 */
import { promises as FS } from "fs";
import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from "child_process";

import Git from "./Git.js";
import File from "./File.js";

export class Dependency implements Dependency.Dependency {
    public static include: string[] = [ '*' ];
    public readonly name: string;
    public readonly repo: Dependency.repo;
    public readonly branch?: string;
    public readonly builder?: Dependency.Builder;
    /**
     * Create a new dependency
     * @param dependency Dependency to create
     * @param logger Logger to use
     * @returns New dependency
     */
    public constructor(dependency: Dependency.Dependency) {
        this.name = dependency.name;
        this.repo = dependency.repo;
        this.branch = dependency.branch;
        this.builder = dependency.builder;
    }
    /** Get the folder of the dependency */
    public get folder(): string {
        return this.name.startsWith('.') ? this.name : `.dep/${this.name}`;
    }
    /**
     * Clone a dependency
     * @param options Options to use
     * @returns Promise<void>
     */
    public async clone(options: Dependency.manageOptions = {}): Promise<string> {
        if (await File.exists(this.folder)) {
            if (!options.force) return await this.pull();
            else await this.uninstall();
        }
        return await Git.clone(this.repo, this.folder, this.branch);
    }
    /**
     * Pull a dependency
     * @returns Promise<void>
     */
    public async pull(): Promise<string> {
        return await Git.pull(this.folder, this.branch);
    }
    /**
     * Install a dependency
     * @param options Options to use
     * @returns Promise<void>
     */
    public async install(): Promise<string[]> {
        const output: string[] = [];
        try {
            const cloneResult = await this.clone();
            output.push(cloneResult);
            const buildResult = await this.build();
            output.push(...buildResult);
            return output;
        } catch (error) { throw error; }
    }
    /**
     * Uninstall a dependency
     * @returns Promise<void>
     */
    public async uninstall(): Promise<string[]> {
        try {
            const output: string[] = [];

            const moves: string[] = this.builder
                ? this.builder
                    .map(step => step.move ? Dependency.getAllOutFolders(step.move) : [])
                    .reduce((acc, val) => acc.concat(val), [])
                : [];

            const folders: string[] = [ this.folder, ...moves ];

            for (const folder of folders) {
                if (!await File.exists(folder)) continue;
                output.push(`Removing &C4${folder}`);
                await FS.rm(folder, { recursive: true });
            }
            return output;
        } catch (error) { throw error; }
    }
    protected async build(): Promise<string[]> {
        const output: string[] = [];
        if (!this.builder || this.builder.length === 0) return output;

        const shell = spawn('/bin/bash', [], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        try { for (const step of this.builder) {
            if (step.run) {
                const run = typeof step.run === 'string' ? [ step.run ] : step.run;
                const commands = [ `cd ${this.folder}`, ...run ];
                const results = await this.executeCommands(commands, shell);
                output.push(...results);
            }
            if (step.move) {
                const moveResults = await this.move(step.move);
                output.push(...moveResults);
            }
        } } catch (error) { throw error; }
        finally { shell.kill(); }
        return output;
    }
    protected async move(move: Dependency.Builder.MoveType): Promise<string[]> {
        const output: string[] = [];
        if (typeof move === 'string' || Array.isArray(move)) {
            const moves = Array.isArray(move) ? move : [ move ];
            for (const destination of moves) {
                const moveResult = await this.moveFiles(destination);
                output.push(...moveResult);
            }
        } else {
            for (const key in move) {
                const value = move[key];
                const destinations = typeof value === 'string' ? [ value ] : value;
                for (const destination of destinations) {
                    const moveResult = await this.moveFiles(destination, key);
                    output.push(...moveResult);
                }
            }
        }
        return output;
    }
    /**
     * Execute multiple commands in a shell
     * @param commands Commands to execute
     * @param customShell Custom shell to use (optional)
     * @returns Output of the commands
     */
    protected async executeCommands(commands: string[], shell: ChildProcessWithoutNullStreams): Promise<string[]> {
        const output: string[] = [];

        shell.stderr.on('data', data => output.push(data.toString()));
        for (const command of commands) {
            const result = await this.executeCommand(shell, command);
            output.push(...result);
        }
        shell.kill();
        return output;
    }
    /**
     * Execute a command in a shell
     * @param shell Shell to execute the command in
     * @param command Command to execute
     * @returns Output of the command
     */
    protected async executeCommand(shell: ChildProcessWithoutNullStreams, command: string): Promise<string[]> {
        const output: string[] = [];
        output.push(`&RRunning command &C4${command}`);
        await new Promise<void>((resolve, reject) => {
            shell.stdin.write(command + '\n');

            const marker = `__END_${Date.now()}__`;
            shell.stdin.write(`echo ${marker}\n`);

            let out: string = '';

            const listener = (data: Buffer) => {
                if (data.toString().includes(marker)) {
                    shell.stdout.off('data', listener);
                    output.push(out.trim());
                    resolve();
                } else out += data.toString().trim()
            };
            shell.stdout.on('data', listener);
            shell.stderr.once('data', data => {
                shell.stdout.off('data', listener);
                output.push(data.toString().trim());
                reject(new Error(`Command "${command}" failed with error: ${data.toString().trim()}`));
            });
        });
        return output;
    }
    /**
     * Move files from a dependency
     * @param destination Destination folder
     * @param source Source folder
     * @returns The output of the operation
     */
    protected async moveFiles(destination: string | string[], source?: string): Promise<string[]> {
        const output: string[] = [];
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
                output.push(`&RMoving source &C4${source} &Rto &C4${folder}`);
                await FS.cp(source, folder, { recursive: true, force: true });
            } catch (error) { throw new Error(`Failed to move files from ${this.name} to ${folder}, \n${error}`); }
        }
        return output;
    }
    /**
     * Get the source path of a dependency
     * @param source Source path
     * @returns Source path
     */
    public static getSourcePath(folder: string, source?: string): string {
        folder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
        if (!source) return folder;
        source = source.startsWith('/') ? source.slice(1) : source;
        return `${folder}/${source}`.replace(/ /g, '\\ ');
    }
    /**
     * Get all folders of a dependency
     * @param builder Builder to get folders from
     * @returns Folders
     */
    public static getAllOutFolders(builder: Dependency.Builder.MoveType): string[] {
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
    export type repo = `https://github.com/${string}/${string}.git`;
    export namespace Builder {
        export interface Move {
            [key: string]: string | string[]
        }
        export type MoveType = string | string[] | Move;
        export interface Step {
            run?: string | string[] | undefined;
            move?: MoveType;
        }
    }
    export type Builder = Builder.Step[];
    export interface Dependency {
        name: string;
        repo: repo;
        branch?: string;
        builder?: Builder;
    }
    export interface manageOptions { force?: boolean; }
}

export default Dependency;

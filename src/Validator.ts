/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility to validate dependencies.
 * @license Apache-2.0
 */
import { promises as FS } from "fs";

import Dependency from './Dependency.js';

export class Validator {
    /**
     * Validates the 'name' property.
     * @param name The 'name' property to validate.
     * @returns `true` if valid, otherwise throws an error.
     */
    public static validateName(name: any): asserts name is string {
        if (name === null || name === undefined) throw new Error('Dependency is missing a name');
        if (typeof name !== 'string') throw new Error('Dependency name is not a string.');
        if (name.length === 0) throw new Error('Dependency name is empty.');
        return;
    }
    /**
     * Validates the repository URL.
     * @param repo The repository URL to validate.
     * @returns `true` if valid, otherwise throws an error.
     * @throws Error if the repository URL is invalid.
     */
    public static validateRepo(repo: any): asserts repo is Dependency.repo  {
        if (repo === null || repo === undefined) throw new Error('Dependency is missing a repo');
        if (typeof repo !== 'string') throw new Error('Dependency repo is not a string.');
        if (!/^https:\/\/github\.com\/[^\/]+\/[^\/]+(?:\.git)?$/.test(repo)) throw new Error(`Dependency repo "${repo}" is not a valid github repo URL.`);
        return;
    }
    /**
     * Validates the 'branch' property.
     * @param branch The 'branch' property to validate.
     * @returns `true` if valid, otherwise throws an error.
     */
    public static validateBranch(branch: any): asserts branch is string | null | undefined {
        if (branch === null || branch === undefined) return;
        if (typeof branch !== 'string') throw new Error('Dependency branch is not a string.');
        if (branch.length === 0) throw new Error('Dependency branch is empty.');
        return;
    }
    public static validateBuilder(builder: any): asserts builder is Dependency.Builder | null | undefined {
        if (builder === null || builder === undefined) return;
        if (!Array.isArray(builder)) throw new Error('Dependency "builder" property must be an array.');
        for (const step of builder) {
            if (typeof step !== 'object' || step == null) throw new Error('Dependency "builder" property must be an object.');
            if ('run' in step) this.validateRun(step.run);
            if ('move' in step) this.validateMove(step.move);
        }
        return;
    }
    /**
     * Validates the 'builder.run' property.
     * @param run The 'builder.run' property to validate.
     * @returns `true` if valid, otherwise throws an error.
     */
    public static validateRun(run: any): asserts run is string | string[] | null | undefined {
        if (run === null || run === undefined) return;
        if (typeof run !== 'string' && !Array.isArray(run)) throw new Error('Dependency "run" property must be a string or an array of strings.');
        if (typeof run === 'string' && run.length === 0) throw new Error('Dependency "run" property is empty.');
        if (Array.isArray(run) && run.some(cmd => typeof cmd !== 'string')) throw new Error('Dependency "run" property must be an array of strings.');
        return;
    }
    /**
     * Validates the 'builder.move' property.
     * @param move The 'builder.move' property to validate.
     * @returns `true` if valid, otherwise throws an error.
     */
    public static validateMove(move: any): asserts move is Dependency.Builder.MoveType | null | undefined {
        if (move === null || move === undefined) return;
        if (typeof move !== 'string' && !Array.isArray(move) && typeof move !== 'object') throw new Error('Dependency "out" property must be a string, an array of strings, or a valid builder object.');
        if (typeof move === 'string' && move.length === 0) throw new Error('Dependency "out" property is empty.');
        if (Array.isArray(move) && move.some(folder => typeof folder !== 'string')) throw new Error('Dependency "out" property must be an array of strings.');
        if (typeof move === 'object' && !Array.isArray(move)) for (const key in move) {
            const folders = move[key];
            if (typeof folders !== 'string' && !Array.isArray(folders)) throw new Error('Dependency "out" property must be a string, an array of strings, or a valid builder object.');
            if (Array.isArray(folders) && folders.some(folder => typeof folder !== 'string')) throw new Error('Dependency "out" property must be an array of strings.');
        }
        return;
    }
    /**
     * Validates a full dependency definition object.
     * @param data The dependency data to validate.
     * @returns `true` if valid, otherwise throws an error.
     */
    public static validateDependency(data: any): asserts data is Dependency.Dependency {
        if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('Dependency definition must be an object.');

        this.validateName(data.name);
        this.validateRepo(data.repo);
        this.validateBranch(data.branch);
        this.validateBuilder(data.builder);

        return;
    }
    /**
     * Check if a file exists
     * @param path Path to check
     * @returns Promise<boolean>
     */
    protected async isFile(path: string): Promise<boolean> {
        try {
            const stats = await FS.stat(path);
            return stats.isFile();
        } catch { return false; }
    }
    /**
     * Check if a file or folder exists
     * @param path Path to check
     * @returns Promise<boolean>
     */
    protected async exists(path: string): Promise<boolean> {
        try { await FS.access(path); return true; } catch { return false; }
    }
}

export default Validator;

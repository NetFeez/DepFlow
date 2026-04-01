/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility to help with File operations.
 * @license Apache-2.0
 */

import { promises as FS } from 'fs';

import Validator from './Validator.js';
import Dependency from './Dependency.js';

export class File {
    /**
     * Validates and transforms raw data into a DependencyDef object.
     * @param data - The raw data to extract from.
     * @returns A valid DependencyDef object.
     */
    private static extractDependency(data: any): Dependency.Dependency {
        Validator.validateDependency(data);
        return data;
    }
    /**
     * Reads and parses a dependency file.
     * @param path - Path to the dependency file.
     * @returns The parsed JSON content.
     */
    private static async read(path: string): Promise<any> {
        try {
            if (!await this.exists(path)) await FS.writeFile(path, '[]');
            if (!await this.isFile(path)) throw new Error(`Dependency file at &C2${path}&R does not exist.`);
            const content = await FS.readFile(path, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Failed to read or parse dependency file at &C2${path}&R.`, { cause: error });
        }
    }
    /**
     * Loads, validates, and compiles dependencies from a file.
     * @param path - Path to the dependency file.
     * @returns An array of valid DependencyDef objects.
     */
    public static async load(path: string): Promise<Dependency.Dependency[]> {
        try {
            const data = await this.read(path);
            if (!Array.isArray(data)) throw new Error('Dependency file content must be an array.');
            const dependencies: Dependency.Dependency[] = [];
            for (const item of data) dependencies.push(this.extractDependency(item));
            return dependencies;
        } catch (error) { throw error; }
    }
    /**
     * Saves an array of dependency definitions to a file.
     * @param path - Path to the dependency file.
     * @param dependencies - The dependencies to save.
     */
    public static async save(path: string, dependencies: any[]): Promise<void> {
        try {
            const validatedDeps: Dependency.Dependency[] = [];
            const seenNames = new Set<string>();
            for (const item of dependencies) {
                const dependency = this.extractDependency(item);
                if (seenNames.has(dependency.name)) throw new Error(`Duplicate dependency name found: "${dependency.name}".`);
                seenNames.add(dependency.name);
                validatedDeps.push(dependency);
            }
            try {
                const content = JSON.stringify(validatedDeps, null, 4);
                await FS.writeFile(path, content);
            } catch (error) { throw new Error(`Failed to write dependency file at &C2${path}&R.`, { cause: error }); }
        } catch (error) { throw error; }
    }
    /**
     * Check if a file exists
     * @param path Path to check
     * @returns Promise<boolean>
     */
    public static async isFile(path: string): Promise<boolean> {
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
    public static async exists(path: string): Promise<boolean> {
        try { await FS.access(path); return true; } catch { return false; }
    }
}

export default File;
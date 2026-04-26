import { promises as FS, readFile } from 'fs';

export class File {
    /**
     * Checks if a given path exists in the file system.
     * It uses fs.access to determine if the path is accessible, returning true if it exists and false if it does not.
     * This method is useful for verifying the presence of files or directories before attempting to read, write, or perform other operations on them, helping to prevent errors related to non-existent paths.
     * @param path The file system path to check for existence.
     * @returns A promise that resolves to true if the path exists, or false if it does not.
     */
    static async exists(path: string): Promise<boolean> {
        try { await FS.access(path); return true; } catch { return false; }
    }
    /**
     * Checks if the given path is a file.
     * It uses fs.stat to retrieve the file system statistics for the path and checks if it is a file using the isFile method.
     * If the path does not exist or is not a file, it returns false.
     * This method is useful for validating that a specific path points to a file before performing operations that require a file, such as reading or writing content.
     * It helps to ensure that the expected file structure is in place and can prevent errors related to invalid paths or types.
     * @param path The file system path to check.
     * @returns A promise that resolves to true if the path is a file, or false if it is not.
     * @throws Will throw an error if the path does not exist or is not a file.
     */
    static async isFile(path: string): Promise<boolean> {
        try {
            const stat = await FS.stat(path);
            return stat.isFile();
        } catch { return false; }
    }
    /**
     * Checks if the given path is a directory.
     * It uses fs.stat to retrieve the file system statistics for the path and checks if it is a directory using the isDirectory method.
     * If the path does not exist or is not a directory, it returns false.
     * This method is useful for validating that a specific path points to a directory before performing operations that require a directory, such as creating files within it or listing its contents.
     * It helps to ensure that the expected directory structure is in place and can prevent errors related to invalid paths or types.
     * @param path The file system path to check.
     * @returns A promise that resolves to true if the path is a directory, or false if it is not.
     * @throws Will throw an error if the path does not exist or is not a directory.
     */
    static async isDirectory(path: string): Promise<boolean> {
        try {
            const stat = await FS.stat(path);
            return stat.isDirectory();
        } catch { return false; }
    }
    /**
     * Reads the content of a file at the specified path using the given encoding (defaulting to 'utf-8').
     * It first checks if the path is a file using the isFile method, and if it is not, it throws an error indicating that the path is not a file.
     * If the path is valid, it uses fs.readFile to read the content of the file and returns it as a string.
     * This method is essential for safely reading files while ensuring that the provided path points to a valid file, preventing errors related to invalid paths or types.
     * @param path The file system path of the file to read.
     * @param encoding The character encoding to use when reading the file (default is 'utf-8').
     * @returns A promise that resolves to the content of the file as a string.
     * @throws Will throw an error if the path does not point to a valid file.
     */
    static async read(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
        if (!await this.isFile(path)) throw new Error(`Path ${path} is not a file.`);
        return await FS.readFile(path, encoding);
    }
    /**
     * Writes the specified content to a file at the given path using the provided encoding (defaulting to 'utf-8').
     * It uses fs.writeFile to write the content to the file, creating the file if it does not exist or overwriting it if it does.
     * This method is crucial for saving data to files while ensuring that the content is properly encoded and that any necessary directories are in place before writing.
     * It can be used for a variety of purposes, such as saving configuration files, logs, or any other data that needs to be persisted in the file system.
     * @param path The file system path where the content should be written.
     * @param content The string content to write to the file.
     * @param encoding The character encoding to use when writing the file (default is 'utf-8').
     * @returns A promise that resolves when the write operation is complete.
     */
    static async write(path: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
        await FS.writeFile(path, content, encoding);
    }
    /**
     * Creates a directory at the specified path with the given options (such as recursive creation). It first checks if the path already exists using the exists method, and if it does, it throws an error to prevent overwriting existing files or directories. If the path does not exist, it uses fs.mkdir to create the directory according to the provided options. This method is essential for safely creating directories while ensuring that existing paths are not unintentionally overwritten, and it can be used to set up necessary directory structures for applications or projects.
     * @param path The file system path where the directory should be created.
     * @param options Optional settings for directory creation, such as { recursive: true } to create parent directories if they do not exist.
     * @returns A promise that resolves when the directory has been successfully created.
     * @throws Will throw an error if the path already exists or if there is an issue during directory creation.
     */
    static async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
        if (await this.exists(path)) throw new Error(`Path ${path} already exists.`);
        await FS.mkdir(path, options);
    }
}

export namespace File {
    export interface ReadDirOptions {
        withFileTypes?: boolean;
    }
}

export default File;
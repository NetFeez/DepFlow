import { promises as FS } from 'fs';

export class File {
    static async exists(path: string): Promise<boolean> {
        try { await FS.access(path); return true; } catch { return false; }
    }
    static async isFile(path: string): Promise<boolean> {
        try {
            const stat = await FS.stat(path);
            return stat.isFile();
        } catch { return false; }
    }
    static async isDirectory(path: string): Promise<boolean> {
        try {
            const stat = await FS.stat(path);
            return stat.isDirectory();
        } catch { return false; }
    }
    static async read(path: string): Promise<string> {
        if (!await this.isFile(path)) {
            throw new Error(`Path ${path} is not a file.`);
        }
        return await FS.readFile(path, 'utf-8');
    }
    static async write(path: string, content: string): Promise<void> {
        await FS.writeFile(path, content, 'utf-8');
    }
}

export namespace File { }

export default File;
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Shared helpers for the test suites: isolated temporary directories.
 * @license Apache-2.0
 */
import os from 'node:os';

import { File, Path } from '@netfeez/common-node';

/**
 * Creates a unique temporary directory for a single test run.
 * @param prefix - The name prefix of the created directory.
 * @returns A promise resolving to the absolute path of the directory.
 **/
export async function createTemp(prefix: string = 'depflow-test'): Promise<string> {
    const dir = Path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await File.ensureDir(dir);
    return dir;
}

/**
 * Removes a temporary directory with its whole content, when present.
 * @param dir - The directory to remove.
 * @returns A promise resolving when the directory is gone or was already absent.
 **/
export async function removeTemp(dir: string): Promise<void> {
    if (!await File.exists(dir)) return;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            await File.remove(dir);
            return;
        } catch (error) {
            if (attempt === 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
}
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Shared helpers for the test suites: isolated temporary directories and git fixtures.
 * @license Apache-2.0
 */
import { execFile, spawn } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { File, Path } from '@netfeez/common-node';

const exec = promisify(execFile);

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

/**
 * A shell script that never finishes on its own, written so taking its shell down leaves nothing behind.
 *
 * @remarks A deadline or a stop takes down the shell of the task, and on Windows the contract kills the
 * direct process only, so a script that leaves a grandchild running keeps the working directory of the
 * task locked long after the test is over. The loops below are built from the shell itself, so the only
 * process ever holding the working directory is the one the contract kills.
 * @returns The script, in the dialect of the shell of this platform.
 **/
export function blockingScript(): string {
    return process.platform === 'win32'
        ? 'for /l %i in (0,0,100000000) do @rem'
        : 'while :; do :; done';
}

/**
 * Runs a program, outside the code under test, so a fixture is never built with the thing it tests.
 * @param executable - The program to run.
 * @param args - The arguments of the program.
 * @param cwd - The working directory to run it in.
 * @returns A promise resolving to the output of the program.
 **/
export async function run(executable: string, args: string[], cwd: string): Promise<string> {
    const { stdout } = await exec(executable, args, { cwd });
    return stdout;
}

/**
 * Runs the command-line entry point this test build compiled, as a process of its own.
 * @param args - The arguments of the CLI, the command and its flags included.
 * @param cwd - The working directory to run the CLI in.
 * @returns A promise resolving to the exit status of the CLI and everything it wrote.
 *
 * @remarks The status a command leaves behind is part of what a user observes, so it cannot be
 * observed by calling a function in this process: the CLI is started the way a user starts it, with
 * its arguments as argv, over the entry point of the build under test.
 **/
export async function runCli(args: string[], cwd: string): Promise<{ code: number | null, output: string }> {
    const bin = fileURLToPath(new URL('../src/cli/bin.js', import.meta.url));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [ bin, ...args ], { cwd, shell: false, stdio: [ 'ignore', 'pipe', 'pipe' ] });
        let output = '';
        child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
        child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, output }));
    });
}

/**
 * Creates a bare git repository with a tagged commit, the source a clone can be made of.
 * @param dir - The directory to create the repository in.
 * @param tag - The tag to point at the first commit.
 * @returns A promise resolving to the path of the bare repository.
 **/
export async function createGitFixture(dir: string, tag: string = 'v1'): Promise<string> {
    const origin = Path.join(dir, 'origin.git');
    const work = Path.join(dir, 'work');
    await File.ensureDir(origin);
    await File.ensureDir(work);

    await run('git', [ 'init', '--bare', '--initial-branch=main', origin ], dir);
    await run('git', [ 'init', '--initial-branch=main' ], work);
    await run('git', [ 'config', 'user.email', 'depflow@netfeez.dev' ], work);
    await run('git', [ 'config', 'user.name', 'depflow' ], work);
    await File.write(Path.join(work, 'version.txt'), tag);
    await run('git', [ 'add', '.' ], work);
    await run('git', [ 'commit', '-m', tag ], work);
    await run('git', [ 'tag', tag ], work);
    await run('git', [ 'remote', 'add', 'origin', origin ], work);
    await run('git', [ 'push', 'origin', `main`, '--tags' ], work);

    return origin;
}

/**
 * Locks a file against writing, so an operation over it fails the way an unwritable artifact does.
 *
 * @remarks A test that needs a real failure cannot assume the environment produces one: a privileged
 * user writes through a read-only file. The lock is therefore probed, and the caller is told whether
 * the environment really denies the write instead of being handed a failure it cannot rely on.
 * @param file - The file to lock.
 * @returns A promise resolving to `true` when the file is now unwritable for this process.
 **/
export async function lockFile(file: string): Promise<boolean> {
    const probe = `${file}.lock-probe`;
    await File.write(probe, 'probe');
    await chmod(probe, 0o444);
    const denied = await writeFile(probe, 'probe').then(() => false, () => true);
    await chmod(probe, 0o666);
    await File.remove(probe);

    await chmod(file, 0o444);
    return denied;
}

/**
 * Undoes the lock of a file, so it can be removed again.
 * @param file - The locked file.
 * @returns A promise resolving when the file is writable again.
 **/
export function unlockFile(file: string): Promise<void> { return chmod(file, 0o666); }

/**
 * Strips from what a process wrote everything the logger only adds for the eye: the color codes and the
 * line wrapping, so a message is matched as the user reads it and not as the terminal renders it.
 * @param output - What the process wrote.
 * @returns The output as a single line of plain text.
 **/
export function plain(output: string): string { return output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ''); }

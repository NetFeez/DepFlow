/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Shared helpers for the test suites: isolated temporary directories and git fixtures.
 * @license Apache-2.0
 */
import { execFile, spawn } from 'node:child_process';
import { chmod, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { File, Path } from '@netfeez/common-node';
import { ConsoleUI } from '@netfeez/vterm';

const exec = promisify(execFile);

/**
 * What a captured run said and how it ended, both of them together: an assertion about a presentation
 * reads the text, and an assertion about a verdict reads the settlement.
 */
export interface Captured<T> {
    /** What the action resolved with, absent when it rejected. */
    result?: T;
    /** The failure the action rejected with, absent when it resolved. */
    error?: unknown;
    /** Every line the action wrote to the console, with the color codes left in place. */
    lines: string[];
    /** The same lines as one string. */
    text: string;
}

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
 * @returns A promise resolving to the exit status of the CLI and everything it wrote, with stdout and
 *          stderr kept apart.
 *
 * @remarks The status a command leaves behind is part of what a user observes, so it cannot be
 * observed by calling a function in this process: the CLI is started the way a user starts it, with
 * its arguments as argv, over the entry point of the build under test.
 *
 * @remarks The two streams are captured apart because the contract is about them apart: a line of
 * stderr is not a failure, and an assertion that cannot tell one stream from the other cannot prove
 * that. `output` is their concatenation, in that order, for the cases that do not care.
 **/
export async function runCli(args: string[], cwd: string): Promise<{ code: number | null, stdout: string, stderr: string, output: string }> {
    const bin = fileURLToPath(new URL('../src/cli/bin.js', import.meta.url));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [ bin, ...args ], { cwd, shell: false, stdio: [ 'ignore', 'pipe', 'pipe' ] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
        child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, stdout, stderr, output: stdout + stderr }));
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
 *
 * @remarks This helper removes every whitespace character, the spaces and the blank lines included, so
 * it cannot answer a question about lines, indentation or how much content a run emitted. A case that
 * needs one of those reads the raw capture and uses {@link strip}, which removes the color codes and
 * nothing else.
 * @param output - What the process wrote.
 * @returns The output as a single line of plain text.
 **/
export function plain(output: string): string { return strip(output).replace(/\s+/g, ''); }

/**
 * Strips from what a process wrote only the color codes, keeping every space, every blank line and
 * every newline exactly where it was.
 * @param output - What the process wrote.
 * @returns The output without its color codes.
 **/
export function strip(output: string): string { return output.replace(/\x1b\[[0-9;]*m/g, ''); }

/**
 * Takes from what an evidence file holds the format tokens `vterm` writes into it.
 *
 * @remarks A `.vlog` is written before anything turns the tokens of `vterm` into ANSI escapes, so a line
 * read from one carries `&C7` where a line read from a terminal carries a color. The grammar is the one
 * the console itself reads, so the tokens taken out are exactly the ones it would have translated and no
 * word of the line is eaten with them.
 *
 * @remarks A case that reads an evidence file to see the markup of the logger leaves the tokens where they
 * are, because the markup is part of what the file says.
 * @param output - The content of an evidence file.
 * @returns The same text with the format tokens left out.
 **/
export function unmarked(output: string): string { return ConsoleUI.cleanFormat(output); }

/**
 * The head `vterm` puts in front of a line: a series of bracketed parts, an arrow, and then the content.
 *
 * @remarks The head is matched at the start of the line and not searched for, so a line of process output
 * that carries an arrow of its own is not mistaken for a decorated one.
 */
const HEAD = /^(?:\[[^\]]*\][^\S\n]?)*->[^\S\n]?/;

/**
 * A line made of nothing but the frame a group of `vterm` is drawn with, so the frame is told from the
 * content by what it is and not by where it was written: the box drawing block, the `+` and the `-` an
 * ASCII renderer falls back to, and the whitespace in between.
 **/
const FRAME = /^[\s|+─-╿-]*$/;

/**
 * The content a render carries, with the decoration a run is drawn in left out.
 *
 * @remarks Three things are removed and each of them is the decoration itself: the head a decorated line
 * is written with, the indentation of the group the line belongs to, and the lines a group is drawn with.
 * What is left is what the run said, in the order it said it, so two modes of a run are compared as the
 * content they carry and not as the structure they are drawn in.
 *
 * @remarks A group is told from the content by being made of nothing but box glyphs, so a command that
 * prints a line of its own is only taken for the frame when it prints a line with nothing but those in it.
 * @param lines - The lines a run rendered, with or without the color codes in them.
 * @returns The content of the render, without the empty lines and without the frame.
 **/
export function body(lines: string[]): string[] {
    return lines
        .map(line => strip(line).replace(HEAD, ''))
        .map(line => line.replace(/^(?:│ )+/, ''))
        .filter(line => line.trim() !== '' && !FRAME.test(line));
}

/**
 * Runs an action with the console captured, so what it reported can be asserted the way a user reads it.
 * @param action - The action to run, whose own outcome is never asserted from inside itself.
 * @returns A promise resolving to what the action settled with, either way, and to everything it wrote.
 *
 * @remarks The streams of the terminal are where the whole presentation of a run goes through, and they
 * are the only place where a logger is observable from a test: the channels a policy owns are built per
 * run, so patching one of them from a test would assert on a channel the run under test never writes to.
 * Both the resolution and the rejection are captured, because a case that expects a rejection still has
 * to read what was printed before it.
 *
 * @example
 * ```ts
 * const captured = await captureOutput(() => cli.commandInstall('install', []));
 * context.expect(strip(captured.text)).includes('✘ C1 failed');
 * ```
 **/
export async function captureOutput<T>(action: () => Promise<T> | T): Promise<Captured<T>> {
    const lines: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: any, ...args: any[]) => {
        lines.push(String(chunk).replace(/\n+$/, ''));
        return true;
    }) as typeof process.stdout.write;
    try {
        const result = await action();
        return { result, lines, text: lines.join('\n') };
    } catch (error) {
        return { error, lines, text: lines.join('\n') };
    } finally { process.stdout.write = write; }
}

/**
 * Waits until a condition holds, for what is written asynchronously and is therefore not on disk on the
 * line after the line that wrote it.
 *
 * @remarks The evidence file of `vterm` is fed by a queue that flushes itself without anyone awaiting it,
 * so a case that reads it right after the run that filled it reads a file that is still being written.
 * Polling is what tells the two apart without turning the logger of the product into the logger of the test.
 * @param probe - The condition to wait for, re-evaluated until it holds or the deadline passes.
 * @param timeout - How long to wait at most, in milliseconds.
 * @returns A promise resolving to `true` when the condition held before the deadline.
 **/
export async function until(probe: () => Promise<boolean>, timeout: number = 10000): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await probe()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return probe();
}

/**
 * Reads the evidence a run left behind: everything under the `.logs` folder of a directory, newest file last.
 * @param dir - The directory the run wrote its evidence in, the working directory of the run.
 * @returns A promise resolving to the content of every evidence file, or an empty string when there is none.
 *
 * @remarks The evidence is the only place where the complete buffer of a command survives a run that
 * decided not to show it, so a case about `silent` or about a successful command has nowhere else to
 * look. Every file is read and they are all returned: the channels of a run attach to the file transport
 * of the logger the run built on, so one run leaves one file, and a test process that ran several runs
 * before this one leaves several.
 **/
export async function readEvidence(dir: string): Promise<string> {
    const root = Path.join(dir, '.logs');
    if (!await File.exists(root)) return '';

    const files: string[] = [];
    for (const day of await readdir(root))
        for (const file of await readdir(Path.join(root, day)))
            files.push(Path.join(root, day, file));
    if (files.length === 0) return '';

    const stamped = await Promise.all(files.map(async (file) => ({ file, at: (await stat(file)).mtimeMs })));
    stamped.sort((a, b) => a.at - b.at);
    const contents = await Promise.all(stamped.map(entry => readFile(entry.file, 'utf-8')));
    return contents.join('');
}


/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the output policy: how a command, and the output of that command, are
 *              presented in the three verbosity modes and with the decoration on and off.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import type TestContext from '@TestSuite/TestContext.js';
import { Engine, Logger } from '@netfeez/vterm';
import { Path } from '@netfeez/common-node';

import OutputPolicy from '../src/task/OutputPolicy.js';
import Task from '../src/task/Task.js';
import { body, captureOutput, createTemp, readEvidence, removeTemp, strip, until, type Captured } from './utils.js';

const suite = new TestSuite('output policy');

/**
 * The width the content of a rendered line is wrapped in.
 *
 * @remarks The policy composes the renderers of its channels out of what it changes and never says how wide
 * the line of content is, and the renderer of a channel asks the width of the terminal of the run. In a
 * terminal that cannot answer the renderer falls back to the eighty columns of `@netfeez/vterm`, which is
 * the width the tests read: a policy whose renderer started to wrap its lines in another width would make
 * this constant wrong, which is the point of reading it at the same width the renderer falls back to.
 */
const RENDER_WIDTH: number = 80;

/** The mode a run asked for, as the flags of the CLI carry it. */
interface Mode {
    verbose?: boolean;
    silent?: boolean;
    decorate?: boolean;
}

/**
 * Builds a policy of its own over a logger whose evidence lands in a directory of its own.
 *
 * @remarks The logger is built by hand because the policy attaches its channels to the file transport it is
 * given, and a logger shared by every case would write the evidence of every case into one file. Each
 * temporary directory is also the identity of the file, which `vterm` writes under the path it is given:
 * one logger per case, one evidence file each.
 *
 * @remarks The file transport of `vterm` feeds its file from a queue it flushes without anyone awaiting it,
 * so the evidence a case asserts on is polled through `until` and never read straight after the run that
 * filled it.
 * @param dir - The directory the run is given, and the one its evidence is written into.
 * @param mode - The mode the run asked for.
 * @returns A promise resolving to the policy of the run.
 **/
async function policy(dir: string, mode: Mode = {}): Promise<OutputPolicy> {
    return new OutputPolicy({
        logger: new Logger({
            name: 'depflow',
            save: true,
            path: Path.join(dir, '.logs', '{YYYY}.{MM}.{DD}', 'evidence.vlog')
        }),
        name: 'depflow',
        verbose: mode.verbose === true,
        silent: mode.silent === true,
        decorate: mode.decorate ?? true
    });
}

/** The result of a command, with only the fields a case is about. **/
function result(overrides: Partial<Task.commandResult> = {}): Task.commandResult {
    return {
        ordinal: 1,
        label: 'npm run build',
        success: true,
        code: 0,
        signal: null,
        reason: null,
        time: 12,
        stdout: '',
        stderr: '',
        diagnostic: '',
        ...overrides
    };
}

/** The summary of a run, as the task hands it over when it settles. **/
function finish(...results: Task.commandResult[]): Task.FinishData {
    return {
        success: results.every(entry => entry.success),
        completes: results.length,
        fails: results.filter(entry => !entry.success).length,
        totalTime: results.reduce((total, entry) => total + entry.time, 0),
        results
    };
}

/** The captured console as plain text, one entry per line, with the blank ones left where they are. **/
function read(captured: Captured<unknown>): string[] { return captured.lines.map(line => strip(line)); }

/** The captured console as plain text, without the blank lines. **/
function content(captured: Captured<unknown>): string[] { return read(captured).filter(line => line.trim() !== ''); }

/** How many times a text appears in what was written. **/
function times(haystack: string, needle: string): number { return haystack.split(needle).length - 1; }

/** The evidence of the run, read once the queue of the logger has flushed it. **/
async function transcript(dir: string, expected: string): Promise<string> {
    await until(async () => (await readEvidence(dir)).includes(expected));
    return readEvidence(dir);
}

//
// ====== Default ======
//

suite.add('a command that ended well is one line, and its output stays off the screen', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({ stdout: '> tsc --noEmit\nall good' }))));

        context.expect(content(captured).length).equals(1);
        context.expect(content(captured)[0]).includes('✔ C1 completed');
        context.expect(captured.text.includes('> tsc --noEmit')).equals(false);
        context.expect(captured.text.includes('all good')).equals(false);
        context.expect(captured.text.includes('npm run build')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command that failed shows the marker, the diagnostic and both channels, once each', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'src/index.ts(4,7): error TS2304',
            stderr: 'npm ERR! code ELIFECYCLE'
        }))));

        const text = captured.text;
        context.expect(times(text, '✘ C1 failed')).equals(1);
        context.expect(times(text, 'Command failed with status 1')).equals(1);
        context.expect(times(text, 'stdout:')).equals(1);
        context.expect(times(text, 'stderr:')).equals(1);
        context.expect(times(text, 'src/index.ts(4,7): error TS2304')).equals(1);
        context.expect(times(text, 'npm ERR! code ELIFECYCLE')).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('every command of a task is reported once, in the order it ran', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: 2 }, finish(
            result({ ordinal: 1, label: 'make' }),
            result({ ordinal: 2, label: 'test', success: false, code: 2, diagnostic: 'Command failed with status 2: test' }),
            result({ ordinal: 3, label: 'ship' })
        )));

        const lines = content(captured).filter(line => /[✔✘⊘]/.test(line));
        context.expect(lines.length).equals(3);
        context.expect(lines[0]).includes('S2 · C1 completed');
        context.expect(lines[1]).includes('S2 · C2 failed');
        context.expect(lines[2]).includes('S2 · C3 completed');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command that wrote a lot and ended well is still one line', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const noise = 'x'.repeat(8000);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({ stdout: noise }))));

        context.expect(content(captured).length).equals(1);
        context.expect(captured.text.includes(noise)).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command that wrote to stderr and ended well is a completion, not an error', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({ stderr: 'a deprecation warning' }))));

        context.expect(content(captured)[0]).includes('✔ C1 completed');
        context.expect(captured.text.includes('[ERR]')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('stdout and stderr are labelled apart, and neither is shown under the other', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'FROM-STDOUT',
            stderr: 'FROM-STDERR'
        }))));

        const text = captured.text;
        context.expect(text.indexOf('stdout:')).ok();
        context.expect(text.indexOf('FROM-STDOUT') > text.indexOf('stdout:')).equals(true);
        context.expect(text.indexOf('stderr:') > text.indexOf('FROM-STDOUT')).equals(true);
        context.expect(text.indexOf('FROM-STDERR') > text.indexOf('stderr:')).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command with no result of its own shows the marker and the reason, and no buffer', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: null,
            reason: 'timeout',
            diagnostic: 'Instruction timed out: make',
            stdout: 'PARTIAL-STDOUT',
            stderr: 'PARTIAL-STDERR'
        }))));

        const text = captured.text;
        context.expect(text.includes('⊘ C1 timed out')).ok();
        context.expect(text.includes('Instruction timed out: make')).ok();
        context.expect(text.includes('stdout:')).equals(false);
        context.expect(text.includes('stderr:')).equals(false);
        context.expect(text.includes('PARTIAL-STDOUT')).equals(false);
        context.expect(text.includes('PARTIAL-STDERR')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the diagnostic of a command is said once, whatever else is said about it', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'the output',
            stderr: 'the error'
        }))));

        context.expect(times(captured.text, 'Command failed with status 1')).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the identity of a command is qualified only when the pipeline has more than one step', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const alone = await policy(dir);
        const captured = await captureOutput(() => alone.settleTask({ step: null }, finish(result({ ordinal: 2 }))));

        const qualified = await policy(dir);
        const other = await captureOutput(() => qualified.settleTask({ step: 4 }, finish(result({ ordinal: 2 }))));

        context.expect(content(captured)[0]).includes('C2 completed');
        context.expect(content(captured)[0].includes('S4')).equals(false);
        context.expect(content(other)[0]).includes('S4 · C2 completed');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the complete buffer of a command reaches the evidence in the default mode', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'KEPT-IN-EVIDENCE',
            stderr: 'ALSO-KEPT'
        }))));

        const evidence = await transcript(dir, 'KEPT-IN-EVIDENCE');
        context.expect(evidence.includes('[C1] npm run build')).ok();
        context.expect(evidence.includes('Command failed with status 1')).ok();
        context.expect(evidence.includes('stdout:')).ok();
        context.expect(evidence.includes('KEPT-IN-EVIDENCE')).ok();
        context.expect(evidence.includes('stderr:')).ok();
        context.expect(evidence.includes('ALSO-KEPT')).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the lifecycle of a run is on the screen in the default mode', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => { run.report.info('Installing dependencies...'); });

        context.expect(captured.text).includes('Installing dependencies...');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command with a reason is never presented as if its buffer were the evidence of a failure', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: 1 }, finish(result({
            success: false,
            code: null,
            reason: 'shell',
            diagnostic: 'The shell exited before the instruction finished: make',
            stdout: 'HALF-WRITTEN',
            stderr: ''
        }))));

        const text = captured.text;
        context.expect(text.includes('⊘ S1 · C1 shell exited')).ok();
        context.expect(text.includes('stdout:')).equals(false);
        context.expect(text.includes('stderr:')).equals(false);
        context.expect(text.includes('HALF-WRITTEN')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the label of a command is thinned to the executable, and cut at forty characters', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const long = `npm${'x'.repeat(80)} --flag`;
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(
            result({ ordinal: 1, success: false, code: 1, label: 'make --all', diagnostic: 'first' }),
            result({ ordinal: 2, success: false, code: 1, label: long, diagnostic: 'second' })
        )));

        // The label of the second command is thinned to forty characters and wrapped in the width the
        // line is given, so the thin is looked for in the content the run said, padding and frames taken
        // out, and not in the line it happened to land on.
        const said = body(read(captured)).map(line => line.trimEnd()).join('');
        context.expect(said).includes('make');
        context.expect(said.includes(long)).equals(false);
        const thinned = 'npm' + 'x'.repeat(36) + '…';
        context.expect(thinned.length).equals(OutputPolicy.LABEL_LENGTH);
        context.expect(said).includes(thinned);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a channel that wrote nothing is not labelled', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'only stdout here',
            stderr: ''
        }))));

        const text = captured.text;
        context.expect(text.includes('stdout:')).ok();
        context.expect(text.includes('stderr:')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== Verbose ======
//

suite.add('a verbose run shows stdout and stderr as they come', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => {
            run.live({ step: null }, 'a line of output', 1, 'stdout');
            run.live({ step: null }, 'a line of errors', 1, 'stderr');
        });

        context.expect(captured.text).includes('a line of output');
        context.expect(captured.text).includes('a line of errors');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a verbose run still settles every command with its result line', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(
            result({ ordinal: 1, label: 'make' }),
            result({ ordinal: 2, label: 'test', success: false, code: 3, diagnostic: 'Command failed with status 3: test' })
        )));

        const text = captured.text;
        context.expect(text).includes('C1 completed');
        context.expect(text).includes('✘ C2 failed');
        context.expect(text).includes('Command failed with status 3: test');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a verbose run marks a command with no result of its own, without its buffer', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: null,
            reason: 'stopped',
            diagnostic: 'Instruction stopped: make',
            stdout: 'HALF',
            stderr: 'WRITTEN'
        }))));

        const text = captured.text;
        context.expect(text).includes('⊘ C1 stopped');
        context.expect(text.includes('stdout:')).equals(false);
        context.expect(text.includes('HALF')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('every live line of a verbose run is attributed to the command that wrote it', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => {
            run.live({ step: null }, 'first of C1', 1, 'stdout');
            run.live({ step: null }, 'second of C1', 1, 'stdout');
            run.live({ step: 3 }, 'first of S3 C1', 1, 'stdout');
        });

        const text = captured.text;
        context.expect(text).includes('[C1]');
        context.expect(text).includes('[S3 · C1]');
        context.expect(times(text, '[C1]')).equals(1);
        context.expect(text.indexOf('first of C1') < text.indexOf('second of C1')).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a verbose run does not reprint the buffer of the command that already streamed it', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'STREAMED-ONCE',
            stderr: 'ERRORED-ONCE'
        }))));

        const text = captured.text;
        context.expect(text).includes('✘ C1 failed');
        context.expect(times(text, 'STREAMED-ONCE')).equals(0);
        context.expect(times(text, 'ERRORED-ONCE')).equals(0);
        context.expect(text.includes('stdout:')).equals(false);
        context.expect(text.includes('stderr:')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the live stream is a projection of the output, not the buffer itself', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => {
            run.live({ step: null }, '     padded line     ', 1, 'stdout');
            run.live({ step: null }, '', 1, 'stdout');
            run.live({ step: null }, 'last line', 1, 'stdout');
        });

        const text = captured.text;
        context.expect(text).includes('padded line');
        context.expect(text.includes('     padded line     ')).equals(false);
        context.expect(times(text, 'last line')).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command with a reason and a command with a status are told apart on the screen', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(
            result({ ordinal: 1, success: false, code: null, reason: 'timeout', diagnostic: 'Instruction timed out: make' }),
            result({ ordinal: 2, success: false, code: 1, diagnostic: 'Command failed with status 1: test' })
        )));

        const text = captured.text;
        context.expect(text).includes('⊘ C1 timed out');
        context.expect(text).includes('✘ C2 failed');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the lifecycle of a verbose run is on the screen', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        const captured = await captureOutput(() => { run.report.info('Installing dependencies...'); });

        context.expect(captured.text).includes('Installing dependencies...');
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== Silent ======
//

suite.add('a silent run says nothing about a command that ended well', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({ stdout: 'the output' }))));

        context.expect(captured.lines.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run says nothing about several commands that all ended well', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(
            result({ ordinal: 1, label: 'make' }),
            result({ ordinal: 2, label: 'test' }),
            result({ ordinal: 3, label: 'ship' })
        )));

        context.expect(captured.lines.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run says one line about the command that failed, and nothing of what it wrote', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(
            result({ ordinal: 1, label: 'make' }),
            result({
                ordinal: 2,
                label: 'npm run build',
                success: false,
                code: 1,
                diagnostic: 'Command failed with status 1: npm run build',
                stdout: 'NEVER-SHOWN',
                stderr: 'NEVER-EITHER'
            })
        )));

        const lines = content(captured);
        context.expect(lines.length).equals(1);
        context.expect(lines[0]).includes('✘ C2 failed');
        context.expect(lines[0]).includes('npm');
        context.expect(lines[0]).includes('exit 1');
        context.expect(captured.text.includes('NEVER-SHOWN')).equals(false);
        context.expect(captured.text.includes('NEVER-EITHER')).equals(false);
        context.expect(captured.text.includes('stdout:')).equals(false);
        context.expect(captured.text.includes('C1')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('silent wins over verbose, whichever order they were asked in', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true, silent: true });
        context.expect(run.verbosity).equals('silent');

        const streamed = await captureOutput(() => { run.live({ step: null }, 'a line of output', 1, 'stdout'); });
        const settled = await captureOutput(() => run.settleTask({ step: null }, finish(result({ stdout: 'the output' }))));
        const failed = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false, code: 1, diagnostic: 'Command failed with status 1: npm run build', stdout: 'NEVER-SHOWN'
        }))));

        context.expect(streamed.lines.length).equals(0);
        context.expect(settled.lines.length).equals(0);
        context.expect(content(failed).length).equals(1);
        context.expect(content(failed)[0]).includes('✘ C1 failed');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the evidence of a silent run keeps the complete buffer of the command that failed', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'KEPT-WHILE-SILENT',
            stderr: 'ALSO-KEPT-WHILE-SILENT'
        }))));

        const evidence = await transcript(dir, 'KEPT-WHILE-SILENT');
        context.expect(captured.text.includes('KEPT-WHILE-SILENT')).equals(false);
        context.expect(evidence.includes('KEPT-WHILE-SILENT')).ok();
        context.expect(evidence.includes('ALSO-KEPT-WHILE-SILENT')).ok();
        context.expect(evidence.includes('Command failed with status 1')).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run says no lifecycle at all', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        const captured = await captureOutput(() => {
            run.report.info('Installing dependencies...');
            run.report.info('Synchronizing configurations...');
        });

        context.expect(captured.lines.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run still builds its channels, so what a mode hides is a render and nothing else', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        context.expect(run.report).instanceOf(Logger);
        context.expect(run.report.engine).instanceOf(Engine);
        context.expect(run.decoration).equals('on');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command with a reason is still said in a silent run', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { silent: true });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: null,
            reason: 'timeout',
            diagnostic: 'Instruction timed out: make',
            stdout: 'NEVER-SHOWN'
        }))));

        const lines = content(captured);
        context.expect(lines.length).equals(1);
        context.expect(lines[0]).includes('⊘ C1 timed out');
        context.expect(lines[0]).includes('npm');
        context.expect(lines[0].includes('npm run build')).equals(false);
        context.expect(captured.text.includes('Instruction timed out')).equals(false);
        context.expect(captured.text.includes('NEVER-SHOWN')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== Decoration ======
//

suite.add('the decorated render carries the timestamp, the level, the name and the separator', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result())));
        const line = content(captured)[0];

        context.expect(run.decoration).equals('on');
        context.expect(line).includes('[INF]');
        context.expect(line).includes('[depflow]');
        context.expect(line).includes('-> ');
        context.expect(/\[\d{4}-\d{2}-\d{2}\] \[\d{2}:\d{2}:\d{2}\]/.test(line)).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the undecorated render is the content alone, and keeps the color of the markers', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { decorate: false });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false,
            code: 1,
            diagnostic: 'Command failed with status 1: npm run build',
            stdout: 'the output'
        }))));

        context.expect(run.decoration).equals('off');
        const text = captured.text;
        context.expect(text.includes('-> ')).equals(false);
        context.expect(text.includes('[depflow]')).equals(false);
        context.expect(text.includes('[INF]')).equals(false);
        context.expect(text.includes('[ERR]')).equals(false);
        context.expect(/\d{4}-\d{2}-\d{2}/.test(text)).equals(false);
        context.expect(/\x1b\[/.test(text)).equals(true);
        context.expect(text).includes('✘ C1 failed');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a verbose run without decoration still streams, and still says nothing around it', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true, decorate: false });
        const captured = await captureOutput(() => {
            run.live({ step: null }, 'a line of output', 1, 'stdout');
            run.settleTask({ step: null }, finish(result({ ordinal: 1, label: 'make' })));
        });

        context.expect(captured.text).includes('a line of output');
        context.expect(captured.text).includes('[C1]');
        context.expect(captured.text).includes('C1 completed');
        context.expect(captured.text.includes('-> ')).equals(false);
        context.expect(captured.text.includes('[depflow]')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run without decoration says exactly what a silent run says', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const failure = finish(result({
            success: false, code: 1, diagnostic: 'Command failed with status 1: npm run build', stdout: 'NEVER-SHOWN'
        }));

        const silent = await policy(dir, { silent: true });
        const first = await captureOutput(() => silent.settleTask({ step: null }, failure));

        const quiet = await policy(dir, { silent: true, decorate: false });
        const second = await captureOutput(() => quiet.settleTask({ step: null }, failure));

        const bare = read(second);
        context.expect(bare.length).equals(read(first).length);
        context.expect(bare[0]).includes('✘ C1 failed');
        context.expect(bare[0].includes(' -> ')).equals(false);
        const padded = (captured: Captured<unknown>): string => body(read(captured)).map(line => line.trimEnd()).join('\n');
        context.expect(padded(second)).equals(padded(first));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the decoration lives inside the width of the line and never loses a word of the run', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const summary = finish(
            result({ ordinal: 1, label: 'make', stdout: 'built' }),
            result({
                ordinal: 2,
                label: 'npm run build',
                success: false,
                code: 1,
                diagnostic: 'Command failed with status 1: npm run build',
                stdout: 'src/index.ts(4,7): error TS2304',
                stderr: 'npm ERR! code ELIFECYCLE'
            })
        );

        const decorated = await policy(dir);
        const withBox = await captureOutput(() => decorated.settleTask({ step: null }, summary));
        const undecorated = await policy(dir, { decorate: false });
        const withoutBox = await captureOutput(() => undecorated.settleTask({ step: null }, summary));

        // The policy opens no group, so the decoration is the head in front of each line and nothing else.
        // The head lives inside the width the renderer is given, so a decorated line wraps its content
        // earlier than an undecorated one does and the two renders are not the same lines: what they share
        // is the words of the run, in the order it said them, the frame and the filler taken out.
        const words = (captured: Captured<unknown>): string[] => body(read(captured)).join(' ').split(/\s+/).filter(Boolean);
        const one = words(withBox);
        const other = words(withoutBox);
        context.expect(other.length).equals(one.length);
        context.expect(other.join(' ')).equals(one.join(' '));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the policy opens no group of its own, so an undecorated run leaves no empty line behind', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const summary = finish(result({
            success: false, code: 1, diagnostic: 'Command failed with status 1: npm run build', stdout: 'the output'
        }));

        const undecorated = await policy(dir, { decorate: false });
        const captured = await captureOutput(() => undecorated.settleTask({ step: null }, summary));

        const text = captured.text;
        context.expect(text.includes('╭')).equals(false);
        context.expect(text.includes('├')).equals(false);
        context.expect(text.includes('╰')).equals(false);
        context.expect(text.includes('│')).equals(false);
        context.expect(read(captured).filter(line => line.trim() === '').length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the render width is high and finite, so turning the decoration off never breaks a pattern', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        context.expect(RENDER_WIDTH > 0).equals(true);
        context.expect(Number.isFinite(RENDER_WIDTH)).equals(true);

        const long = 'y'.repeat(RENDER_WIDTH * 2);
        const run = await policy(dir, { decorate: false });
        const captured = await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false, code: 1, diagnostic: `Command failed with status 1: ${long}`, stdout: long
        }))));

        context.expect(content(captured).length > 1).equals(true);
        context.expect(captured.text.includes('y'.repeat(RENDER_WIDTH))).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the channel of the evidence is written without decoration, whatever the mode asked for', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir, { verbose: true });
        await captureOutput(() => run.settleTask({ step: null }, finish(result({
            success: false, code: 1, diagnostic: 'Command failed with status 1: npm run build', stdout: 'PLAIN-LINE'
        }))));

        const evidence = await transcript(dir, 'PLAIN-LINE');
        const decorated = /&C7\[\d{4}-\d{2}-\d{2}\] \[\d{2}:\d{2}:\d{2}\]/;
        const lines = evidence.split(/\r?\n/).filter(line => line.trim() !== '');

        // Every channel of the policy saves, so the file is an account of the run and not a channel: the
        // lines are told apart by the head a rendered line carries and an evidence line does not.
        const shown = lines.filter(line => decorated.test(line));
        const plain = lines.filter(line => !decorated.test(line));
        context.expect(shown.length > 0).ok();
        context.expect(plain.length > 0).ok();

        for (const line of plain) {
            context.expect(line.includes('[depflow]')).equals(false);
            context.expect(line.includes(' -> ')).equals(false);
            context.expect(/\[\d{4}-\d{2}-\d{2}\]/.test(line)).equals(false);
            context.expect(/\[(LOG|INF|WRN|ERR|DBG)\]/.test(line)).equals(false);
        }
        context.expect(evidence).includes('[C1] npm run build');
        context.expect(plain.filter(line => line.includes('PLAIN-LINE')).length).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a step that failed is marked once, by the pipeline that caught it', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const failure = new Task.Failure(finish(result({ success: false, code: 1, diagnostic: 'Command failed with status 1: make' })), 'command');
        const captured = await captureOutput(() => {
            run.stepFailed({ step: 2 }, failure);
            run.stepFailed({ step: null }, new Task.Failure(finish(), 'timeout'));
        });

        const text = captured.text;
        context.expect(content(captured).length).equals(2);
        context.expect(text).includes('✘ S2 · step failed');
        context.expect(text).includes('⊘ step failed');
        context.expect(text.includes('Command failed with status 1')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a step that tolerated its failures is said so, once, with how many it was', async (context) => {
    const dir = await createTemp('depflow policy');
    try {
        const run = await policy(dir);
        const captured = await captureOutput(() => run.settleBuild({
            ok: true,
            commands: 3,
            failed: 2,
            tolerated: 2,
            steps: [
                { index: 1, kind: 'run', ran: true, success: true, failed: 0, tolerated: false, reason: null, commands: [] },
                { index: 2, kind: 'run', ran: true, success: true, failed: 2, tolerated: true, reason: null, commands: [] }
            ]
        }));

        context.expect(content(captured).length).equals(1);
        context.expect(content(captured)[0]).includes('⚠ S2 tolerated 2 failures');
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the task runner: one verdict per run, working directory, argv,
 *              deadline, cancellation and observability.
 * @license Apache-2.0
 */
import { Path } from '@netfeez/common-node';

import TestSuite from '@TestSuite/TestSuite.js';

import Task from '../src/task/Task.js';
import { blockingScript, createTemp, removeTemp } from './utils.js';

const suite = new TestSuite('task runner');

/**
 * The node program used to print what it is told to, or to fail with the given status.
 *
 * @remarks The body is written between double quotes because `cmd.exe`, the shell a task runs its
 * scripts in on Windows, does not treat a single quote as quoting: a body using it loses whatever it
 * wraps. Every body below therefore quotes its own strings with single quotes.
 **/
function script(body: string): string { return `node -e "${body}"`; }

/**
 * Runs a task and resolves to the summary of the run, whether it resolved or rejected.
 *
 * @remarks A rejected run carries the same summary a resolved one does, so a case comparing two runs does
 * not have to care about how either of them ended.
 *
 * @param task - The task to run.
 * @returns A promise resolving to the summary of the run.
 **/
async function outcome(task: Task): Promise<Task.FinishData> {
    try { return await task.run(); }
    catch (error) { return (error as Task.Failure).outcome; }
}

/**
 * The result of an instruction without its clock, so two runs of the same instruction are comparable.
 * @param result - The result of the instruction.
 * @returns A text standing for everything the result says but how long it took.
 **/
function verdict(result: Task.commandResult): string {
    return [
        result.ordinal, result.success, result.code, result.signal,
        result.reason, result.stdout, result.stderr, result.diagnostic
    ].join('|');
}

suite.add('resolves with the summary of a passing run', async (context) => {
    const dir = await createTemp();
    try {
        const data = await new Task(dir, [ script('console.log(1)') ]).run();
        context.expect(data.success).equals(true);
        context.expect(data.fails).equals(0);
        context.expect(data.completes).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects with the summary of a failing run', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script('process.exit(1)') ]);
        try {
            await task.run();
            context.fail('expected the run to reject');
        } catch (error) {
            context.expect(error).instanceOf(Task.Failure);
            const failure = error as Task.Failure;
            context.expect(failure.outcome.fails).equals(1);
            context.expect(failure.outcome.results.length).equals(1);
            context.expect(failure.reason).equals('command');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs every instruction after a failing one, allowed to fail or not', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script('process.exit(1)'), script("console.log('second')") ], { allowFails: true });
        const data = await task.run();
        context.expect(data.completes).equals(2);
        context.expect(data.results[1].stdout).equals('second');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs the instructions in the working directory of the task', async (context) => {
    const dir = await createTemp('depflow spaced cwd ');
    try {
        const data = await new Task(dir, [ script('console.log(process.cwd())') ]).run();
        context.expect(data.results[0].stdout.includes(dir)).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects when the working directory does not exist', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(`${dir}/missing`, [ script('console.log(1)') ]);
        try {
            await task.run();
            context.fail('expected the run to reject a missing working directory');
        } catch (error) {
            context.expect((error as Task.Failure).reason).equals('shell');
            context.expect((error as Task.Failure).outcome.success).equals(false);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs a program with its arguments out of any shell', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ { executable: 'node', args: [ '-e', 'console.log(process.argv[1])', '; echo pwned' ] } ]);
        const data = await task.run();
        context.expect(data.success).equals(true);
        context.expect(data.results[0].stdout).equals('; echo pwned');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs a program in its own working directory', async (context) => {
    const dir = await createTemp();
    try {
        const nested = Path.join(dir, 'nested');
        const data = await new Task(dir, [
            { executable: 'node', args: [ '-e', 'require("fs").mkdirSync(process.argv[1], { recursive: true })', nested ] },
            { executable: 'node', args: [ '-e', 'console.log(process.cwd())' ], cwd: nested }
        ]).run();
        context.expect(data.success).equals(true);
        context.expect(data.results[1].stdout).equals(nested);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('keeps the exit status of a program', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ { executable: 'node', args: [ '-e', 'process.exit(3)' ] } ]);
        try {
            await task.run();
            context.fail('expected the run to reject');
        } catch (error) {
            const failure = error as Task.Failure;
            context.expect(failure.outcome.results[0].code).equals(3);
            context.expect(failure.outcome.results[0].stderr).equals('');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects a program that cannot be started', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ { executable: 'depflow-does-not-exist' } ]);
        try {
            await task.run();
            context.fail('expected the run to reject');
        } catch (error) {
            const failure = error as Task.Failure;
            context.expect(failure.outcome.results[0].reason).equals('spawn');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects when the deadline of the task is reached', async (context) => {
    const dir = await createTemp();
    try {
        const started = Date.now();
        const task = new Task(dir, [ blockingScript() ], { maxTimeMs: 500 });
        try {
            await task.run();
            context.fail('expected the run to reject on the deadline');
        } catch (error) {
            const failure = error as Task.Failure;
            context.expect(failure.reason).equals('timeout');
            context.expect(Date.now() - started < 30000).equals(true);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('leaves the deadline unbounded when it is negative', async (context) => {
    const dir = await createTemp();
    try {
        const data = await new Task(dir, [ script("console.log('done')") ], { maxTimeMs: -1 }).run();
        context.expect(data.success).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects with a stopped reason when the task is stopped', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ blockingScript(), script("console.log('never')") ]);
        const stopper = setTimeout(() => task.stop(), 300);
        try {
            await task.run();
            context.fail('expected the run to reject once stopped');
        } catch (error) {
            context.expect((error as Task.Failure).reason).equals('stopped');
            context.expect((error as Task.Failure).outcome.completes).equals(1);
        } finally { clearTimeout(stopper); }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects when the shell of the task dies', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ 'exit 0', script("console.log('never')") ]);
        try {
            await task.run();
            context.fail('expected the run to reject once the shell is gone');
        } catch (error) {
            const failure = error as Task.Failure;
            context.expect(failure.reason).equals('shell');
            context.expect(failure.outcome.completes).equals(1);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('diagnoses the shell an instruction exits, instead of waiting for the deadline', async (context) => {
    const dir = await createTemp();
    try {
        const started = Date.now();
        const task = new Task(dir, [ 'exit 1', script("console.log('never')") ], { maxTimeMs: 10000 });
        try {
            await task.run();
            context.fail('expected the run to reject once the shell is gone');
        } catch (error) {
            const failure = error as Task.Failure;
            context.expect(failure.reason).equals('shell');
            context.expect(failure.outcome.results[0].diagnostic).includes('exit 1');
            context.expect(failure.outcome.results[0].code).equals(null);
            context.expect(Date.now() - started < 10000).equals(true);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('tolerates the failures of a run that allows them', async (context) => {
    const dir = await createTemp();
    try {
        const data = await new Task(dir, [ script('process.exit(2)') ], { allowFails: true }).run();
        context.expect(data.success).equals(true);
        context.expect(data.fails).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('tolerates no failure of a program that cannot be started', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ { executable: 'depflow-does-not-exist' } ], { allowFails: true });
        try {
            await task.run();
            context.fail('expected the run to reject on a program that never started');
        } catch (error) {
            context.expect((error as Task.Failure).reason).equals('spawn');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('tolerates no failure of a shell that is already gone', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ 'exit 0', script("console.log('never')") ], { allowFails: true });
        try {
            await task.run();
            context.fail('expected the run to reject once the shell is gone');
        } catch (error) {
            context.expect((error as Task.Failure).reason).equals('shell');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('never reports success for a run that allows failures but did not fail', async (context) => {
    const dir = await createTemp();
    try {
        const data = await new Task(dir, [ script('console.log(1)') ], { allowFails: true }).run();
        context.expect(data.success).equals(true);
        context.expect(data.fails).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('tolerates no failure when the task is stopped anyway', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ blockingScript() ], { allowFails: true });
        const stopper = setTimeout(() => task.stop(), 300);
        try {
            await task.run();
            context.fail('expected the run to reject once stopped');
        } catch (error) {
            context.expect((error as Task.Failure).reason).equals('stopped');
        } finally { clearTimeout(stopper); }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('does not let the output of an instruction stand for the status line', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script("console.log('DEP_FLOW_END_1=0')"), script("console.log('second')") ]);
        const data = await task.run();
        context.expect(data.success).equals(true);
        context.expect(data.completes).equals(2);
        context.expect(data.results[0].stdout).equals('DEP_FLOW_END_1=0');
        context.expect(data.results[1].stdout).equals('second');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('keeps the marker of the shell out of the output', async (context) => {
    const dir = await createTemp();
    try {
        const lines: string[] = [];
        const task = new Task(dir, [ script("console.log('visible')") ]);
        task.on('line', (line) => lines.push(line));
        const data = await task.run();
        context.expect(data.results[0].stdout).equals('visible');
        context.expect(lines.join('|')).equals('visible');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('separates the errors of an instruction from its output', async (context) => {
    const dir = await createTemp();
    try {
        const output: string[] = [];
        const errors: string[] = [];
        const task = new Task(dir, [ script("console.log('out'); console.error('boom')") ]);
        task.on('line', (line) => output.push(line));
        task.on('err', (line) => errors.push(line));
        const data = await task.run();
        context.expect(data.success).equals(true);
        context.expect(output).includes('out');
        context.expect(errors).includes('boom');
        context.expect(data.results[0].stderr).equals('boom');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports the error of a failing instruction with its stderr', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script("console.error('boom'); process.exit(1)") ]);
        try {
            await task.run();
            context.fail('expected the run to reject');
        } catch (error) {
            const failure = error as Task.Failure;
            context.expect(failure.outcome.results[0].stderr).includes('boom');
            context.expect(failure.outcome.results[0].diagnostic).includes('status 1');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports every line of a multi line output', async (context) => {
    const dir = await createTemp();
    try {
        const lines: string[] = [];
        const task = new Task(dir, [ script("console.log('one'); console.log('two')") ]);
        task.on('line', (line) => lines.push(line));
        const data = await task.run();
        context.expect(lines).includes('one');
        context.expect(lines).includes('two');
        context.expect(data.results[0].stdout).equals('one\ntwo');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports the same summary in the finish event and in the verdict', async (context) => {
    const dir = await createTemp();
    try {
        let finished: Task.FinishData | null = null;
        const task = new Task(dir, [ script('console.log(1)') ]);
        task.on('finish', (data) => { finished = data; });
        const data = await task.run();
        context.expect(finished).instanceOf(Object);
        context.expect((finished as unknown as Task.FinishData).success).equals(data.success);
        context.expect((finished as unknown as Task.FinishData).completes).equals(data.completes);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('emits a step for every instruction that ran', async (context) => {
    const dir = await createTemp();
    try {
        const steps: number[] = [];
        const task = new Task(dir, [ script('console.log(1)'), script('console.log(2)') ]);
        task.on('step', (_result, step) => steps.push(step));
        await task.run();
        context.expect(steps).includes(1);
        context.expect(steps).includes(2);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects a second run of the same task', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script('console.log(1)') ]);
        await task.run();
        try {
            await task.run();
            context.fail('expected a second run to reject');
        } catch (error) {
            context.expect((error as Error).message).includes('already run');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs an empty task as a success', async (context) => {
    const dir = await createTemp();
    try {
        const data = await new Task(dir, []).run();
        context.expect(data.success).equals(true);
        context.expect(data.completes).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('mixes scripts and programs in the same task', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [
            script("console.log('script')"),
            { executable: 'node', args: [ '-e', 'console.log("program")' ] }
        ]);
        const data = await task.run();
        context.expect(data.success).equals(true);
        context.expect(data.results[0].stdout).equals('script');
        context.expect(data.results[1].stdout).equals('program');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('waits for the instruction in flight before stopping', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script("setTimeout(() => console.log('late'), 900)") ]);
        const stopper = setTimeout(() => task.stop(), 200);
        try {
            await task.run();
            context.fail('expected the run to reject once stopped');
        } catch (error) {
            context.expect((error as Task.Failure).reason).equals('stopped');
        } finally { clearTimeout(stopper); }
        await context.sleep(1200);
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== The events a task reports, and what they are not ======
//

suite.add('every live line carries the ordinal of the command that wrote it', async (context) => {
    const dir = await createTemp();
    try {
        const out: string[] = [];
        const err: string[] = [];
        const task = new Task(dir, [
            script("console.log('out-one'); console.error('err-one')"),
            script("console.log('out-two'); console.error('err-two')")
        ]);
        task.on('line', (line, ordinal) => out.push(`${ordinal}:${line}`));
        task.on('err', (line, ordinal) => err.push(`${ordinal}:${line}`));
        const data = await task.run();

        // The ordinal of a line is the ordinal of the result it belongs to, and that is what tells two
        // commands apart on a live stream. The order between the two channels is not promised (R-8.2), so
        // what is compared is the attribution of every line, and not the order they arrived in.
        context.expect(out.join(' ')).equals('1:out-one 2:out-two');
        context.expect(err.join(' ')).equals('1:err-one 2:err-two');
        context.expect(data.results.map(result => result.ordinal).join(' ')).equals('1 2');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the verdict of an instruction is the same whether anything is listening or not', async (context) => {
    const dir = await createTemp();
    try {
        const program = { executable: 'node', args: [ '-e', "const fs = require('fs'); fs.writeSync(1, 'out-line'); fs.writeSync(2, 'err-line'); process.exit(4)" ] };
        const heard: string[] = [];
        const listened = new Task(dir, [ program ]);
        listened.on('line', line => heard.push(`line ${line}`));
        listened.on('err', line => heard.push(`err ${line}`));
        const quiet = new Task(dir, [ { executable: 'node', args: [ ...program.args ] } ]);
        const listenedData = await outcome(listened);
        const quietData = await outcome(quiet);

        // The first run had listeners and they heard both channels, so the two verdicts being equal is a
        // statement about the verdict and not about nobody having been there to hear the other one.
        context.expect(heard.join(' ')).equals('line out-line err err-line');
        context.expect(verdict(listenedData.results[0])).equals(verdict(quietData.results[0]));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the buffer keeps what no live event carried, so it is not a rebuild of them', async (context) => {
    const dir = await createTemp();
    try {
        const out: string[] = [];
        const err: string[] = [];
        const task = new Task(dir, [
            { executable: 'node', args: [ '-e', "require('fs').writeSync(1, 'first\\n  padded  \\n\\nsecond\\n')" ] }
        ]);
        task.on('line', line => out.push(line));
        task.on('err', line => err.push(line));
        const data = await task.run();

        // The events are a projection of the rendering: they trimmed every line and dropped the blank one
        // (R-8.4). The buffer is the truth, and it still carries what the projection lost (R-8.6, R-8.7).
        context.expect(out.join('|')).equals('first|padded|second');
        context.expect(err.join('|')).equals('');
        context.expect(data.results[0].stdout).equals('first\n  padded  \n\nsecond');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a blank line of output produces no live event and is still in the buffer', async (context) => {
    const dir = await createTemp();
    try {
        const out: string[] = [];
        const err: string[] = [];
        const task = new Task(dir, [
            { executable: 'node', args: [ '-e', "require('fs').writeSync(1, 'before\\n\\n   \\nafter\\n')" ] }
        ]);
        task.on('line', line => out.push(line));
        task.on('err', line => err.push(line));
        const data = await task.run();

        context.expect(out.join('|')).equals('before|after');
        context.expect(err.join('|')).equals('');

        // Interior, so the trim of the whole buffer keeps them: two lines that reached no listener and are
        // in the evidence all the same.
        const lines = data.results[0].stdout.split('\n');
        context.expect(lines.length).equals(4);
        context.expect(lines[1]).equals('');
        context.expect(lines[2]).equals('   ');
        context.expect(data.results[0].stderr).equals('');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the last line, the one with no newline, is emitted before the run ends', async (context) => {
    const dir = await createTemp();
    try {
        const seen: string[] = [];
        const task = new Task(dir, [ { executable: 'node', args: [ '-e', "require('fs').writeSync(1, 'no-newline')" ] } ]);
        task.on('line', (line, ordinal) => seen.push(`line ${line} ${ordinal} finished=${task.isFinished}`));
        task.on('step', result => seen.push(`step ${result.ordinal}`));
        task.on('finish', () => seen.push('finish'));
        const data = await task.run();

        // A line that is never closed is retained until there is nothing left to retain it for, and it goes
        // out with the command it belongs to: the run had not finished when it was emitted (R-8.5).
        context.expect(seen.join(' | ')).equals('line no-newline 1 finished=false | step 1 | finish');
        context.expect(data.results[0].stdout).equals('no-newline');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a task nobody listens to keeps both buffers whole', async (context) => {
    const dir = await createTemp();
    try {
        const program = { executable: 'node', args: [ '-e', "const fs = require('fs'); for (let i = 1; i <= 200; i++) { fs.writeSync(1, 'out-' + i + '\\n'); fs.writeSync(2, 'err-' + i + '\\n'); }" ] };
        const data = await outcome(new Task(dir, [ program ]));
        const out = data.results[0].stdout.split('\n');
        const err = data.results[0].stderr.split('\n');

        // Nothing was listening, and both buffers are whole: there is no limit, no sampling and no
        // deduplication to apply to a run that reported nothing (R-7.1, R-7.2).
        context.expect(data.success).equals(true);
        context.expect(out.length).equals(200);
        context.expect(err.length).equals(200);
        context.expect(out[0]).equals('out-1');
        context.expect(out[199]).equals('out-200');
        context.expect(err[0]).equals('err-1');
        context.expect(err[199]).equals('err-200');
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

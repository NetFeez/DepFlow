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
            context.expect(failure.outcome.errors.length).equals(1);
            context.expect(failure.reason).equals('command');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs every instruction after a failing one', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, [ script('process.exit(1)'), script("console.log('second')") ], { allowFails: true });
        const data = await task.run();
        context.expect(data.completes).equals(2);
        context.expect(data.results[1].result).equals('second');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs the instructions in the working directory of the task', async (context) => {
    const dir = await createTemp('depflow spaced cwd ');
    try {
        const data = await new Task(dir, [ script('console.log(process.cwd())') ]).run();
        context.expect(data.results[0].result.includes(dir)).equals(true);
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
        context.expect(data.results[0].result).equals('; echo pwned');
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
        context.expect(data.results[1].result).equals(nested);
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
            context.expect(failure.outcome.errors[0]).includes('exit 1');
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
        context.expect(data.results[0].result).equals('DEP_FLOW_END_1=0');
        context.expect(data.results[1].result).equals('second');
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
        context.expect(data.results[0].result).equals('visible');
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
            context.expect(failure.outcome.errors[0]).includes('boom');
            context.expect(failure.outcome.errors[0]).includes('status 1');
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
        context.expect(data.results[0].result).equals('one\ntwo');
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
        context.expect(data.results[0].result).equals('script');
        context.expect(data.results[1].result).equals('program');
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

export default suite;

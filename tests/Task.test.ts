/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Structural tests for the task runner completion summary.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';

import Task from '../src/task/Task.js';
import { createTemp, removeTemp } from './utils.js';

const suite = new TestSuite('task runner');

suite.add('reports zero fails for a passing command', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, ['node -e "console.log(1)"']);
        const data = await context.awaitEvent<Task.FinishData>((done, fail) => {
            task.once('finish', done);
            task.start().catch(fail);
        }, 30000);
        context.expect(data.fails).equals(0);
        context.expect(data.completes).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports a fail for a failing command', async (context) => {
    const dir = await createTemp();
    try {
        const task = new Task(dir, ['node -e "process.exit(1)"']);
        const data = await context.awaitEvent<Task.FinishData>((done, fail) => {
            task.once('finish', done);
            task.start().catch(fail);
        }, 30000);
        context.expect(data.fails).equals(1);
        context.expect(data.errors.length).equals(1);
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
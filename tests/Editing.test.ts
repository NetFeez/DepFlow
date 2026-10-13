/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the configuration editing commands: resolver, builder, action and config.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import type TestContext from '@TestSuite/TestContext.js';
import { File, Path } from '@netfeez/common-node';

import DepFlowCLI from '../src/cli/DepflowCLI.js';
import Actions from '../src/cli/Actions.js';
import Config from '../src/config/Config.js';
import { createTemp, removeTemp } from './utils.js';

const suite = new TestSuite('config editing');

/**
 * Creates a project with a single git dependency in the given directory.
 * @param directory - The directory holding the project.
 * @returns A promise resolving to the absolute path of the config file.
 **/
async function project(directory: string): Promise<string> {
    const file = Path.join(directory, 'depflow.json');
    await File.write(file, JSON.stringify({
        dependencies: [{ name: 'acme/ui', repo: 'https://github.com/acme/ui.git' }]
    }));
    return file;
}

/**
 * Asserts that an editing action rejects with a message carrying the expected text.
 * @param context - The context of the test.
 * @param action - The action expected to reject.
 * @param message - The text the rejection message is expected to include.
 * @returns A promise resolving when the rejection was observed.
 **/
async function rejects(context: TestContext, action: () => Promise<void>, message: string): Promise<void> {
    try {
        await action();
        context.fail(`expected the action to reject with: ${message}`);
    } catch (error) { context.expect((error as Error).message).includes(message); }
}

suite.add('resolver add stores a plain target and an object target', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.resolver(cli.context, [ 'add', '@ui', 'public/lib/ui' ]);
        await Actions.resolver(cli.context, [ 'add', '@cdn', 'public/lib/ui' ], { type: 'module', cdnUrl: 'https://cdn.x/ui.js' });

        const loaded = await Config.load(file);
        context.expect(loaded.data.resolver['@ui']).equals('public/lib/ui');
        context.expect(JSON.stringify(loaded.data.resolver['@cdn'])).equals('{"local":"public/lib/ui","type":"module","cdn":"https://cdn.x/ui.js"}');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('resolver add targets a dependency and edits it through --dep', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.resolver(cli.context, [ 'add', '@ui', 'lib' ], { dep: 'acme/ui' });

        const loaded = await Config.load(file);
        context.expect('@ui' in loaded.data.resolver).equals(false);
        context.expect(loaded.data.dependencies[0].resolver['@ui']).equals('lib');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('resolver add refuses a taken alias and --force overwrites it', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.resolver(cli.context, [ 'add', '@x', 'one' ]);
        await rejects(context, () => Actions.resolver(cli.context, [ 'add', '@x', 'two' ]), 'already exists');
        await Actions.resolver(cli.context, [ 'add', '@x', 'two' ], { force: true });

        const loaded = await Config.load(file);
        context.expect(loaded.data.resolver['@x']).equals('two');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('resolver remove and clear edit the resolver and reject unknown aliases', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.resolver(cli.context, [ 'add', '@a', 'one' ]);
        await Actions.resolver(cli.context, [ 'add', '@b', 'two' ]);
        await Actions.resolver(cli.context, [ 'remove', '@a' ]);
        await rejects(context, () => Actions.resolver(cli.context, [ 'remove', '@a' ]), 'not found');

        let loaded = await Config.load(file);
        context.expect('@a' in loaded.data.resolver).equals(false);
        context.expect(loaded.data.resolver['@b']).equals('two');

        await Actions.resolver(cli.context, [ 'clear' ]);
        loaded = await Config.load(file);
        context.expect(Object.keys(loaded.data.resolver).length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('resolver commands reject an unknown dependency', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);
        await rejects(context, () => Actions.resolver(cli.context, [ 'add', '@x', 'one' ], { dep: 'zeta' }), 'not found');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('builder add appends a processed run, extract and transform step', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.builder(cli.context, [ 'add', 'run', 'npm ci' ], { dep: 'acme/ui' });
        await Actions.builder(cli.context, [ 'add', 'run', 'npm install', 'npm run build' ], { dep: 'acme/ui', maxTime: '1000', allowFails: true });
        await Actions.builder(cli.context, [ 'add', 'extract', 'dist/**/*.js' ], { dep: 'acme/ui', to: '.test', map: '^dist' });
        await Actions.builder(cli.context, [ 'add', 'transform', 'dist/**/*.js' ], { dep: 'acme/ui', search: 'x', replace: 'y' });

        const steps = (await Config.load(file)).data.dependencies[0].builder;
        context.expect(steps.length).equals(4);
        context.expect(JSON.stringify(steps[0])).equals('{"run":"npm ci","maxTimeMs":60000,"allowFails":false}');
        context.expect(JSON.stringify(steps[1])).equals('{"run":["npm install","npm run build"],"maxTimeMs":1000,"allowFails":true}');
        context.expect(JSON.stringify(steps[2])).equals('{"extract":{"dist/**/*.js":{"to":".test","map":"^dist"}}}');
        context.expect(JSON.stringify(steps[3])).equals('{"transform":{"glob":"dist/**/*.js","search":"x","replace":"y","flags":"g"}}');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('builder add requires a scope and rejects an unknown kind', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await rejects(context, () => Actions.builder(cli.context, [ 'add', 'run', 'npm ci' ]), '--dep');
        await rejects(context, () => Actions.builder(cli.context, [ 'add', 'shell', 'x' ], { dep: 'acme/ui' }), 'Unknown build step');
        await rejects(context, () => Actions.builder(cli.context, [ 'add', 'extract', 'dist/**/*.js' ], { dep: 'acme/ui' }), 'Usage');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('builder remove, move and clear edit the pipeline', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.builder(cli.context, [ 'add', 'run', 'one' ], { dep: 'acme/ui' });
        await Actions.builder(cli.context, [ 'add', 'run', 'two' ], { dep: 'acme/ui' });
        await Actions.builder(cli.context, [ 'add', 'run', 'three' ], { dep: 'acme/ui' });

        await Actions.builder(cli.context, [ 'remove', '1' ], { dep: 'acme/ui' });
        await Actions.builder(cli.context, [ 'move', '0', '1' ], { dep: 'acme/ui' });

        let steps = (await Config.load(file)).data.dependencies[0].builder;
        context.expect(steps.map(step => (step as { run: string }).run).join(',')).equals('three,one');

        await Actions.builder(cli.context, [ 'clear' ], { dep: 'acme/ui' });
        steps = (await Config.load(file)).data.dependencies[0].builder;
        context.expect(steps.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('action create, list and remove, and builder edits a named action', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.action(cli.context, [ 'create', 'lint' ]);
        await rejects(context, () => Actions.action(cli.context, [ 'create', 'lint' ]), 'already exists');
        await Actions.builder(cli.context, [ 'add', 'run', 'eslint .' ], { action: 'lint' });

        let loaded = await Config.load(file);
        context.expect(JSON.stringify(loaded.data.actions['lint'])).equals('[{"run":"eslint .","maxTimeMs":60000,"allowFails":false}]');

        await Actions.action(cli.context, [ 'remove', 'lint' ]);
        loaded = await Config.load(file);
        context.expect('lint' in loaded.data.actions).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('builder rejects a named action that does not exist yet', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);
        await rejects(context, () => Actions.builder(cli.context, [ 'add', 'run', 'eslint' ], { action: 'lint' }), 'not found');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('config set, get and unset edit the top-level settings', async (context) => {
    const dir = await createTemp();
    try {
        const file = await project(dir);
        const cli = new DepFlowCLI(file);

        await Actions.config(cli.context, [ 'set', 'outDir', 'build' ]);
        await Actions.config(cli.context, [ 'set', 'tsconfig', 'tsconfig.json' ]);

        let loaded = await Config.load(file);
        context.expect(loaded.data.outDir).equals('build');
        context.expect(loaded.data.tsconfig).equals('tsconfig.json');

        await Actions.config(cli.context, [ 'unset', 'tsconfig' ]);
        loaded = await Config.load(file);
        context.expect(loaded.data.tsconfig).equals(null);

        await rejects(context, () => Actions.config(cli.context, [ 'unset', 'outDir' ]), 'cannot be unset');
        await rejects(context, () => Actions.config(cli.context, [ 'set', 'nope', 'x' ]), 'Unknown setting');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add registers an npm dependency with its version and defaults to latest', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);

        await Actions.add(cli.context, [ '@scope/pkg@1.2.3' ], { npm: true });
        await Actions.add(cli.context, [ 'plain' ], { npm: true });

        const loaded = await Config.load(file);
        context.expect(loaded.data.npmDependencies[0].name).equals('@scope/pkg');
        context.expect(loaded.data.npmDependencies[0].version).equals('1.2.3');
        context.expect(loaded.data.npmDependencies[1].name).equals('plain');
        context.expect(loaded.data.npmDependencies[1].version).equals('latest');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add checks out the git dependency at the requested tag', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);

        await Actions.add(cli.context, [ 'acme/ui' ], { tag: 'v2' });

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies[0].tag).equals('v2');
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

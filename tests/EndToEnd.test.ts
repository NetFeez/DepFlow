/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description End-to-end regression tests: the CLI as a user runs it, over a project whose path carries
 *              spaces, proving the guarantees of the contract from the outside.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import { createGitFixture, createTemp, plain, removeTemp, run, runCli } from './utils.js';

const suite = new TestSuite('end to end');

/** The name of the configuration file every project of the suite is driven with. **/
const CONFIG = 'depflow.json';

/**
 * The root of a project, in a directory whose name carries spaces, so every layer is exercised under
 * the one a user meets most often and least comfortably.
 * @param dir - The temporary directory the project lives in.
 * @returns The root of the project.
 **/
function project(dir: string): string { return Path.join(dir, 'a project with spaces'); }

/**
 * Writes the configuration of a project with one git dependency and one alias of its own.
 * @param root - The root of the project.
 * @param repo - The repository the dependency is acquired from.
 * @param tag - The tag the dependency materializes.
 * @returns A promise resolving to the path of the configuration file.
 **/
async function config(root: string, repo: string, tag: string = 'v1'): Promise<string> {
    const file = Path.join(root, CONFIG);
    await File.write(file, JSON.stringify({
        outDir: 'dist',
        resolver: { '@utils': 'src/utils' },
        dependencies: [ { name: 'omega', repo, tag, resolver: { '@omega': '.depflow/omega' } } ]
    }, null, 4));
    return file;
}

suite.add('install materializes the dependency under .depflow at its declared tag', async (context) => {
    const dir = await createTemp('depflow end to end ');
    try {
        const root = project(dir);
        await File.ensureDir(root);
        const origin = await createGitFixture(dir, 'v1');
        await config(root, origin);

        const { code } = await runCli([ 'install', '-f', CONFIG ], root);

        const checkout = Path.join(root, '.depflow', 'omega');
        context.expect(code).equals(0);
        context.expect(await File.read(Path.join(checkout, 'version.txt'), 'utf-8')).equals('v1');
        context.expect((await run('git', [ 'rev-parse', '--abbrev-ref', 'HEAD' ], checkout)).trim()).equals('HEAD');
        context.expect((await run('git', [ 'describe', '--tags', '--exact-match' ], checkout)).trim()).equals('v1');
        context.expect(await File.exists(Path.join(checkout, '.git'))).ok();
        context.expect(await File.exists(Path.join(root, 'version.txt'))).notOk();
        context.expect(await File.exists(Path.join(root, '.git'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rewrite-paths resolves the aliases of the built files and of the dependency', async (context) => {
    const dir = await createTemp('depflow end to end ');
    try {
        const root = project(dir);
        await File.ensureDir(Path.join(root, 'dist'));
        const origin = await createGitFixture(dir, 'v1');
        await config(root, origin);
        await File.write(Path.join(root, 'dist', 'app.js'), "import utils from '@utils';\nimport omega from '@omega';");
        await runCli([ 'install', '-f', CONFIG ], root);

        const { code } = await runCli([ 'rewrite-paths', '-f', CONFIG ], root);

        context.expect(code).equals(0);
        context.expect(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8'))
            .equals("import utils from '../src/utils';\nimport omega from '../.depflow/omega';");
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a broken acquisition leaves no artifact and reports no success', async (context) => {
    const dir = await createTemp('depflow end to end ');
    try {
        const root = project(dir);
        await File.ensureDir(root);
        await config(root, Path.join(dir, 'no-such-repository.git'));

        const { code, output } = await runCli([ 'install', '-f', CONFIG ], root);

        context.expect(code).equals(1);
        context.expect(plain(output).includes('Installed')).equals(false);
        context.expect(plain(output).includes('Synchronizing')).equals(false);
        context.expect(await File.exists(Path.join(root, '.depflow', 'omega', 'version.txt'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('remove takes the checkout and the config entry away, and a second one reports it is gone', async (context) => {
    const dir = await createTemp('depflow end to end ');
    try {
        const root = project(dir);
        await File.ensureDir(root);
        const origin = await createGitFixture(dir, 'v1');
        const file = await config(root, origin);
        await runCli([ 'install', '-f', CONFIG ], root);

        const first = await runCli([ 'remove', 'omega', '-f', CONFIG ], root);
        const second = await runCli([ 'remove', 'omega', '-f', CONFIG ], root);

        context.expect(first.code).equals(0);
        context.expect(second.code).equals(1);
        context.expect(plain(second.output).includes('notfound')).ok();
        context.expect(await File.exists(Path.join(root, '.depflow', 'omega'))).notOk();
        context.expect(JSON.parse(await File.read(file, 'utf-8')).dependencies.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add refuses an identity that would escape the flow folder', async (context) => {
    const dir = await createTemp('depflow end to end ');
    try {
        const root = project(dir);
        await File.ensureDir(root);
        const origin = await createGitFixture(dir, 'v1');
        await File.write(Path.join(root, CONFIG), JSON.stringify({ dependencies: [] }, null, 4));

        const { code, output } = await runCli([ 'add', origin, '../../escaped', '-f', CONFIG ], root);

        context.expect(code).equals(1);
        context.expect(plain(output).length > 0).ok();
        context.expect(await File.exists(Path.join(root, '..', '..', 'escaped'))).notOk();
        context.expect(await File.exists(Path.join(dir, 'escaped'))).notOk();
        context.expect(JSON.parse(await File.read(Path.join(root, CONFIG), 'utf-8')).dependencies.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the CLI flow: filtered install guard and remove/add semantics.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import DepFlowCLI, { options } from '../src/cli/DepFLowCLI.js';
import Config from '../src/config/Config.js';
import { createGitFixture, createTemp, lockFile, plain, removeTemp, runCli, unlockFile } from './utils.js';

const suite = new TestSuite('cli flow');

/**
 * Creates a config file with a single git dependency in the given directory.
 * @param directory - The directory holding the project.
 * @returns A promise resolving to the absolute path of the config file.
 **/
async function configWith(directory: string): Promise<string> {
    const file = Path.join(directory, 'depflow.json');
    await File.write(file, JSON.stringify({
        dependencies: [{ name: 'alpha', repo: 'https://github.com/netfeez/alpha.git' }]
    }, null, 4));
    return file;
}

/**
 * Builds a project whose built files carry an import only the path resolver can resolve.
 * @param dir - The temporary directory holding the project.
 * @returns A promise resolving to the root of the project.
 **/
async function buildable(dir: string): Promise<string> {
    const root = Path.join(dir, 'project');
    await File.ensureDir(Path.join(root, 'dist'));
    await File.write(Path.join(root, 'dist', 'app.js'), "import x from '@utils';");
    await File.write(Path.join(root, 'depflow.json'), JSON.stringify({
        outDir: 'dist',
        resolver: { '@utils': 'src/utils' }
    }));
    return root;
}

/**
 * Whether a command rejects, so a case is proven instead of being swallowed.
 *
 * @remarks An assertion raised inside a `try` whose `catch` is empty never fails the test: the catch
 * receives the assertion itself. The rejection is therefore answered as a value, and asserted where
 * nothing can intercept it.
 * @param action - The action expected to reject.
 * @returns A promise resolving to `true` when the action rejected.
 **/
async function rejects(action: () => Promise<unknown>): Promise<boolean> {
    try { await action(); return false; }
    catch { return true; }
}

suite.add('install rejects a non-matching dependency name', async (context) => {
    const dir = await createTemp();
    try {
        const file = await configWith(dir);
        const cli = new DepFlowCLI(file);
        try {
            await cli.commandInstall('install', ['zeta']);
            context.fail('expected the install to reject the unknown name');
        } catch (error) {
            context.expect((error as Error).message).equals('Specified dependencies not found.');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('install rejects an empty dependency set', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);
        try {
            await cli.commandInstall('install', []);
            context.fail('expected the install to reject an empty dependency set');
        } catch (error) {
            context.expect((error as Error).message).equals('No dependencies to install.');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('remove uninstalls artifacts and drops the config entry', async (context) => {
    const dir = await createTemp();
    try {
        const file = await configWith(dir);
        const target = Path.join(dir, '.depflow', 'alpha');
        await File.ensureDir(target);
        await File.write(Path.join(target, 'file.txt'), 'content');

        const cli = new DepFlowCLI(file);
        await cli.commandRemove('remove', ['alpha']);

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies.length).equals(0);
        context.expect(await File.exists(target)).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('remove rejects an unknown identifier', async (context) => {
    const dir = await createTemp();
    try {
        const file = await configWith(dir);
        const cli = new DepFlowCLI(file);
        try {
            await cli.commandRemove('remove', ['zeta']);
            context.fail('expected the remove to reject the unknown name');
        } catch (error) {
            context.expect((error as Error).message).equals('Dependency "zeta" not found.');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add persists the dependency and the editor schema', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);
        await cli.commandAdd('add', ['https://github.com/netfeez/omega.git']);

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies.length).equals(1);
        context.expect(loaded.data.dependencies[0].name).equals('netfeez.omega');
        context.expect(await File.exists(Path.join(dir, '.depflow', 'schema.json'))).ok();

        const written = JSON.parse(await File.read(file, 'utf-8'));
        context.expect(written.dependencies[0].repo).equals('https://github.com/netfeez/omega.git');
        context.expect(written.dependencies[0].tag).equals('main');
        context.expect(written.dependencies[0].builder.length).equals(0);
        context.expect(Object.keys(written.dependencies[0].resolver).length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('parses the command line against the declared options', (context) => {
    const { args, flags } = options.parse([ 'sync', '-f', 'custom.json', '--cdn' ]);
    context.expect(args.join(' ')).equals('sync');
    context.expect(flags.flow).equals('custom.json');
    context.expect(flags.cdn).equals(true);
    context.expect(flags.watch).equals(false);
    context.done();
});

suite.add('add rejects a name already taken by another dependency', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);
        await cli.commandAdd('add', [ 'https://github.com/netfeez/omega.git', 'omega' ]);
        try {
            await cli.commandAdd('add', [ 'https://github.com/netfeez/other.git', 'omega' ]);
            context.fail('expected the add to reject the taken name');
        } catch (error) {
            context.expect((error as Error).message).includes('already exists');
        }

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies.length).equals(1);
        context.expect(loaded.data.dependencies[0].repo).equals('https://github.com/netfeez/omega.git');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add rejects a repository that is not clonable', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);
        try {
            await cli.commandAdd('add', [ 'netfeez/omega' ]);
            context.fail('expected the add to reject the repository');
        } catch (error) {
            context.expect((error as Error).message).includes('clonable git repository');
        }

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies.length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add requires a name when the repository is not a github one', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);
        try {
            await cli.commandAdd('add', [ 'git@gitlab.com:netfeez/omega.git' ]);
            context.fail('expected the add to reject the unknown name derivation');
        } catch (error) {
            context.expect((error as Error).message).includes('name');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('add persists a local repository under the given name', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [] }));
        const cli = new DepFlowCLI(file);
        await cli.commandAdd('add', [ origin, 'omega' ]);

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies.length).equals(1);
        context.expect(loaded.data.dependencies[0].name).equals('omega');
        context.expect(loaded.data.dependencies[0].repo).equals(origin);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('list tells an installed dependency from a missing one', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({
            dependencies: [
                { name: 'alpha', repo: origin, tag: 'v1' },
                { name: 'beta', repo: origin, tag: 'v1' }
            ]
        }));
        await File.ensureDir(Path.join(dir, '.depflow', 'alpha'));

        const cli = new DepFlowCLI(file);
        const lines: string[] = [];
        cli.out.info = (message: string) => { lines.push(message); };
        await cli.list('list', []);

        const alpha = lines.find(line => line.includes('alpha'));
        const beta = lines.find(line => line.includes('beta'));
        context.expect(alpha).includes('installed');
        context.expect(beta).includes('missing');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('install brings the dependency to the revision of its tag', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ dependencies: [ { name: 'alpha', repo: origin, tag: 'v1' } ] }));

        const cli = new DepFlowCLI(file);
        await cli.commandInstall('install', []);

        const checkout = Path.join(dir, '.depflow', 'alpha', 'version.txt');
        context.expect(await File.read(checkout, 'utf-8')).equals('v1');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports no success when the acquisition of a dependency fails', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({
            dependencies: [ { name: 'alpha', repo: Path.join(dir, 'no-such-repository.git') } ]
        }));

        const cli = new DepFlowCLI(file);
        const lines: string[] = [];
        cli.out.info = (message: string) => { lines.push(message); };
        cli.out.error = (message: string) => { lines.push(message); };

        context.expect(await rejects(() => cli.commandInstall('install', []))).equals(true);
        context.expect(lines.some(line => line.includes('Installed'))).equals(false);
        context.expect(lines.some(line => line.includes('Synchronizing'))).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('exits with a non-zero status when rewrite-paths has a file it cannot rewrite', async (context) => {
    const dir = await createTemp();
    const locked = { file: '' };
    try {
        const root = await buildable(dir);
        locked.file = Path.join(root, 'dist', 'locked.js');
        await File.write(locked.file, "import x from '@utils';");
        if (!await lockFile(locked.file)) {
            context.warn('this environment writes through a read-only file, the failure cannot be produced here');
            context.done('skipped: the environment denies no write');
            return;
        }

        const { code, output } = await runCli([ 'rewrite-paths', '-f', 'depflow.json' ], root);

        context.expect(code).equals(1);
        context.expect(plain(output).includes('Pathaliasesresolvedin')).equals(false);
        context.expect(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8')).includes('src/utils');
        context.done();
    } finally {
        if (locked.file) await unlockFile(locked.file).catch(() => { });
        await removeTemp(dir);
    }
});

suite.add('exits with a zero status when rewrite-paths rewrites every file', async (context) => {
    const dir = await createTemp();
    try {
        const root = await buildable(dir);
        const { code, output } = await runCli([ 'rewrite-paths', '-f', 'depflow.json' ], root);

        context.expect(code).equals(0);
        context.expect(plain(output)).includes('Pathaliasesresolvedin');
        context.expect(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8')).includes('src/utils');
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
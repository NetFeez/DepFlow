/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the CLI flow: filtered install guard and remove/add semantics.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import DepFlowCLI from '../src/cli/DepFLowCLI.js';
import Config from '../src/config/Config.js';
import { createTemp, removeTemp } from './utils.js';

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
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
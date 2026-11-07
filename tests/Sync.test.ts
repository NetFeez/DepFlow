/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the synchronization targets declared globally and per dependency.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import DepFlowCLI from '../src/cli/DepflowCLI.js';
import Actions from '../src/cli/Actions.js';
import TSConfig from '../src/config/TSConfig.js';
import ImportMap from '../src/config/ImportMap.js';
import { createTemp, removeTemp } from './utils.js';

const suite = new TestSuite('sync targets');

/**
 * Writes a project configuration into a temporary project.
 * @param dir - The temporary directory holding the project.
 * @param config - The configuration to persist.
 * @returns A promise resolving to the project root and the config path.
 */
async function project(dir: string, config: unknown): Promise<{ root: string; file: string }> {
    const root = Path.join(dir, 'project');
    await File.ensureDir(root);
    const file = Path.join(root, 'depflow.json');
    await File.write(file, JSON.stringify(config, null, 4));
    return { root, file };
}

/**
 * Reads a JSON file as an object.
 * @param file - The file to read.
 * @returns The parsed object.
 */
async function readJson(file: string): Promise<any> {
    return JSON.parse(await File.read(file, 'utf-8'));
}

suite.add('routes each dependency aliases to its own targets and inherits the global ones', async (context) => {
    const dir = await createTemp();
    try {
        const { root, file } = await project(dir, {
            tsconfig: [ 'tsconfig.client.json', 'tsconfig.pwa.json' ],
            importmap: [ 'public/importmap.json', 'public/importmap.pwa.json' ],
            resolver: { '@base': 'src/base' },
            dependencies: [
                {
                    name: 'alpha',
                    repo: 'https://github.com/netfeez/alpha.git',
                    tsconfig: 'tsconfig.pwa.json',
                    importmap: 'public/importmap.pwa.json',
                    resolver: { '@alpha': 'src/alpha' }
                },
                {
                    name: 'beta',
                    repo: 'https://github.com/netfeez/beta.git',
                    tsconfig: 'tsconfig.client.json',
                    importmap: 'public/importmap.json',
                    resolver: { '@beta': 'src/beta' }
                },
                {
                    name: 'gamma',
                    repo: 'https://github.com/netfeez/gamma.git',
                    resolver: { '@gamma': 'src/gamma' }
                }
            ]
        });

        const globalMapFile = Path.join(root, 'public', 'importmap.json');
        await File.ensureDir(Path.dirname(globalMapFile));
        await File.write(globalMapFile, JSON.stringify({
            imports: {},
            scopes: { '/scope/': { 'scope-alias': './scope-target.js' } }
        }, null, 4));

        await Actions.sync(new DepFlowCLI(file).context, []);

        const client = await readJson(Path.join(root, 'tsconfig.client.json'));
        const pwa = await readJson(Path.join(root, 'tsconfig.pwa.json'));
        const globalMap = await readJson(Path.join(root, 'public', 'importmap.json'));
        const pwaMap = await readJson(Path.join(root, 'public', 'importmap.pwa.json'));

        context.expect('@base' in client.compilerOptions.paths).ok();
        context.expect('@beta' in client.compilerOptions.paths).ok();
        context.expect('@gamma' in client.compilerOptions.paths).ok();
        context.expect('@alpha' in client.compilerOptions.paths).notOk();

        context.expect('@base' in pwa.compilerOptions.paths).ok();
        context.expect('@alpha' in pwa.compilerOptions.paths).ok();
        context.expect('@gamma' in pwa.compilerOptions.paths).ok();
        context.expect('@beta' in pwa.compilerOptions.paths).notOk();

        context.expect('@base' in globalMap.imports).ok();
        context.expect('@beta' in globalMap.imports).ok();
        context.expect('@gamma' in globalMap.imports).ok();
        context.expect('@alpha' in globalMap.imports).notOk();
        context.expect(JSON.stringify(globalMap.scopes)).equals(JSON.stringify({ '/scope/': { 'scope-alias': './scope-target.js' } }));

        context.expect('@base' in pwaMap.imports).ok();
        context.expect('@alpha' in pwaMap.imports).ok();
        context.expect('@gamma' in pwaMap.imports).ok();
        context.expect('@beta' in pwaMap.imports).notOk();

        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('synchronizes a dependency target even when the global one is null', async (context) => {
    const dir = await createTemp();
    try {
        const { root, file } = await project(dir, {
            tsconfig: null,
            importmap: null,
            dependencies: [{
                name: 'alpha',
                repo: 'https://github.com/netfeez/alpha.git',
                tsconfig: 'tsconfig.pwa.json',
                importmap: 'public/importmap.pwa.json',
                resolver: { '@alpha': 'src/alpha' }
            }]
        });

        await Actions.sync(new DepFlowCLI(file).context, []);

        const tsconfig = await readJson(Path.join(root, 'tsconfig.pwa.json'));
        const importmap = await readJson(Path.join(root, 'public', 'importmap.pwa.json'));

        context.expect('@alpha' in tsconfig.compilerOptions.paths).ok();
        context.expect('@alpha' in importmap.imports).ok();

        const defaultTsconfig = await File.exists(Path.join(root, 'tsconfig.json'));
        const defaultImportMap = await File.exists(Path.join(root, 'importmap.json'));
        context.expect(defaultTsconfig).notOk();
        context.expect(defaultImportMap).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('keeps dependency ownership when the project declares the same alias', async (context) => {
    const dir = await createTemp();
    try {
        const { root, file } = await project(dir, {
            tsconfig: 'tsconfig.json',
            importmap: 'public/importmap.json',
            resolver: { '@utils/*': 'src/utils' },
            dependencies: [{
                name: 'alpha',
                repo: 'https://github.com/netfeez/alpha.git',
                tsconfig: 'tsconfig.dep.json',
                importmap: 'public/importmap.dep.json',
                resolver: { '@utils/*': 'deps/alpha/utils' }
            }]
        });

        await Actions.sync(new DepFlowCLI(file).context, []);

        const tsconfig = await readJson(Path.join(root, 'tsconfig.json'));
        const dependencyTsconfig = await readJson(Path.join(root, 'tsconfig.dep.json'));
        const importmap = await readJson(Path.join(root, 'public', 'importmap.json'));
        const dependencyImportmap = await readJson(Path.join(root, 'public', 'importmap.dep.json'));

        context.expect(JSON.stringify(tsconfig.compilerOptions.paths['@utils/*'])).equals(JSON.stringify([ './src/utils/*' ]));
        context.expect(JSON.stringify(dependencyTsconfig.compilerOptions.paths['@utils/*'])).equals(JSON.stringify([ './deps/alpha/utils/*' ]));
        context.expect(importmap.imports['@utils/']).equals('../src/utils/');
        context.expect(dependencyImportmap.imports['@utils/']).equals('../deps/alpha/utils/');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('gives the project alias priority in a shared synchronization target', async (context) => {
    const dir = await createTemp();
    try {
        const { root, file } = await project(dir, {
            tsconfig: 'tsconfig.shared.json',
            importmap: 'public/importmap.shared.json',
            resolver: { '@utils/*': 'src/utils' },
            dependencies: [{
                name: 'alpha',
                repo: 'https://github.com/netfeez/alpha.git',
                tsconfig: 'tsconfig.shared.json',
                importmap: 'public/importmap.shared.json',
                resolver: { '@utils/*': 'deps/alpha/utils' }
            }]
        });

        await Actions.sync(new DepFlowCLI(file).context, []);

        const tsconfig = await readJson(Path.join(root, 'tsconfig.shared.json'));
        const importmap = await readJson(Path.join(root, 'public', 'importmap.shared.json'));

        context.expect(JSON.stringify(tsconfig.compilerOptions.paths['@utils/*'])).equals(JSON.stringify([ './src/utils/*' ]));
        context.expect(importmap.imports['@utils/']).equals('../src/utils/');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('an empty list disables only that synchronization kind', async (context) => {
    const dir = await createTemp();
    try {
        const { root, file } = await project(dir, {
            tsconfig: 'tsconfig.global.json',
            importmap: 'public/importmap.global.json',
            resolver: { '@base': 'src/base' },
            dependencies: [{
                name: 'alpha',
                repo: 'https://github.com/netfeez/alpha.git',
                tsconfig: [],
                importmap: null,
                resolver: { '@alpha': 'src/alpha' }
            }]
        });

        await Actions.sync(new DepFlowCLI(file).context, []);

        const tsconfig = await readJson(Path.join(root, 'tsconfig.global.json'));
        const importmap = await readJson(Path.join(root, 'public', 'importmap.global.json'));

        context.expect('@base' in tsconfig.compilerOptions.paths).ok();
        context.expect('@alpha' in tsconfig.compilerOptions.paths).notOk();
        context.expect('@base' in importmap.imports).ok();
        context.expect('@alpha' in importmap.imports).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('resolves relative targets from the project root and writes each file once', async (context) => {
    const dir = await createTemp();
    try {
        const { root, file } = await project(dir, {
            tsconfig: [ 'config/tsconfig.global.json', 'config/tsconfig.global.json' ],
            importmap: 'config/importmap.global.json',
            resolver: { '@base': 'src/base' },
            dependencies: [{
                name: 'alpha',
                repo: 'https://github.com/netfeez/alpha.git',
                tsconfig: 'config/tsconfig.global.json',
                importmap: 'config/importmap.global.json',
                resolver: { '@alpha': 'src/alpha' }
            }]
        });

        const tsconfigSaves: string[] = [];
        const importMapSaves: string[] = [];
        const saveTSConfig = TSConfig.prototype.save;
        const saveImportMap = ImportMap.prototype.save;

        TSConfig.prototype.save = async function (this: TSConfig, path?: string): Promise<void> {
            tsconfigSaves.push(path ?? (Reflect.get(this, 'path') as string));
            return saveTSConfig.call(this, path);
        };
        ImportMap.prototype.save = async function (this: ImportMap, path?: string): Promise<void> {
            importMapSaves.push(path ?? (Reflect.get(this, 'path') as string));
            return saveImportMap.call(this, path);
        };

        try {
            await Actions.sync(new DepFlowCLI(file).context, []);

            const tsconfigFile = Path.join(root, 'config', 'tsconfig.global.json');
            const importmapFile = Path.join(root, 'config', 'importmap.global.json');
            context.expect(await File.exists(tsconfigFile)).ok();
            context.expect(await File.exists(Path.join(root, 'tsconfig.global.json'))).notOk();

            const tsconfig = await readJson(tsconfigFile);
            const importmap = await readJson(importmapFile);
            context.expect('@base' in tsconfig.compilerOptions.paths).ok();
            context.expect('@alpha' in tsconfig.compilerOptions.paths).ok();
            context.expect('@base' in importmap.imports).ok();
            context.expect('@alpha' in importmap.imports).ok();
            context.expect(tsconfigSaves.filter(path => path === tsconfigFile).length).equals(1);
            context.expect(importMapSaves.filter(path => path === importmapFile).length).equals(1);
            context.done();
        } finally {
            TSConfig.prototype.save = saveTSConfig;
            ImportMap.prototype.save = saveImportMap;
        }
    } finally { await removeTemp(dir); }
});

export default suite;

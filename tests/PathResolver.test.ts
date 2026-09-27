/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the path resolver: the out directory it owns, the files it rewrites,
 *              the extensions it declares and the failures it reports.
 * @license Apache-2.0
 */
import FS from 'node:fs';

import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';
import { Logger } from '@netfeez/vterm';

import PathResolver from '../src/resolve/PathResolver.js';
import schema from '../src/schema/schema.js';
import { createTemp, lockFile, removeTemp, unlockFile } from './utils.js';

const suite = new TestSuite('path resolver');

/** The import every fixture of the suite carries, and the alias that rewrites it. **/
const IMPORT = "import x from '@utils';";

/** The resolver the fixtures use, pointing at a folder that does not exist yet. **/
const RESOLVER: schema.Resolver = { '@utils': 'src/utils' };

/** A watcher session, as far as a test needs to know about one. **/
interface Watcher { close(): void }

/**
 * Builds a project with a built file inside it, and returns its root.
 * @param dir - The temporary directory holding the project.
 * @param file - The built file, relative to the out directory.
 * @param content - The content of the built file.
 * @returns A promise resolving to the root of the project.
 **/
async function project(dir: string, file: string, content: string = IMPORT): Promise<string> {
    const root = Path.join(dir, 'project');
    await File.ensureDir(Path.join(root, 'dist'));
    await File.write(Path.join(root, 'dist', file), content);
    return root;
}

/**
 * Builds a resolver over a project, collecting everything it reports.
 * @param root - The root of the project.
 * @param lines - The array collecting the reported lines.
 * @returns The resolver.
 **/
function resolver(root: string, lines: string[] = []): PathResolver {
    const logger = new Logger({ name: 'TEST' });
    logger.log = (message: string) => { lines.push(message); };
    logger.warn = (message: string) => { lines.push(message); };
    logger.error = (message: string) => { lines.push(message); };

    return new PathResolver(schema.Config.process({ outDir: 'dist', resolver: RESOLVER }), root, { logger });
}

/**
 * Normalizes path separators for portable comparisons.
 * @param value - The path to normalize.
 * @returns The path written with forward slashes.
 **/
function normalized(value: string): string { return value.replace(/\\/g, '/'); }

/**
 * Intercepts the watcher session a resolver opens, so a test can close it when it is done.
 *
 * @remarks A watcher session lasts as long as the process does, and the contract makes no promise of
 * a way to stop it, so a test that opens one would keep the whole suite alive. The handle is taken
 * from `fs.watch` instead of from a new API on the resolver, which would be a product decision.
 * @returns A function restoring `fs.watch` and closing the session that was opened, if any.
 **/
function captureWatcher(): () => void {
    const module = FS as unknown as { watch: (...args: never[]) => Watcher };
    const original = module.watch;
    let handle: Watcher | null = null;

    module.watch = (...args: never[]) => { handle = original(...args); return handle; };
    return () => { module.watch = original; handle?.close(); };
}

suite.add('rewrites the built files of the out directory in local mode', async (context) => {
    const dir = await createTemp();
    try {
        const root = await project(dir, 'app.js');
        await resolver(root).rewritePaths('local');

        context.expect(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8')).equals("import x from '../src/utils';");
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('resolves the out directory against the project root, not the process one', async (context) => {
    const dir = await createTemp();
    try {
        const root = await project(dir, 'app.js');
        const instance = resolver(root);

        await instance.rewritePaths('local');

        context.expect(normalized(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8'))).includes('src/utils');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rewrites every file of the out directory, in nested folders too', async (context) => {
    const dir = await createTemp();
    try {
        const root = await project(dir, 'app.js');
        await File.write(Path.join(root, 'dist', 'nested', 'deep.mjs'), IMPORT);
        await File.write(Path.join(root, 'dist', 'nested', 'deeper', 'leaf.ts'), IMPORT);

        await resolver(root).rewritePaths('local');

        context.expect(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8')).includes('src/utils');
        context.expect(await File.read(Path.join(root, 'dist', 'nested', 'deep.mjs'), 'utf-8')).includes('../../src/utils');
        context.expect(await File.read(Path.join(root, 'dist', 'nested', 'deeper', 'leaf.ts'), 'utf-8')).includes('../../../src/utils');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rewrites every extension the resolver owns', async (context) => {
    const dir = await createTemp();
    try {
        const root = Path.join(dir, 'project');
        await File.ensureDir(Path.join(root, 'dist'));
        for (const extension of PathResolver.EXTENSIONS) await File.write(Path.join(root, 'dist', `app${extension}`), IMPORT);

        await resolver(root).rewritePaths('local');

        for (const extension of PathResolver.EXTENSIONS) {
            const content = await File.read(Path.join(root, 'dist', `app${extension}`), 'utf-8');
            context.expect(content).includes('src/utils');
        }
        context.expect(PathResolver.EXTENSIONS).includes('.cjs');
        context.expect(PathResolver.EXTENSIONS).includes('.mjs');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('leaves the files outside those extensions alone', async (context) => {
    const dir = await createTemp();
    try {
        const root = await project(dir, 'styles.css', IMPORT);
        await File.write(Path.join(root, 'dist', 'notes.txt'), IMPORT);

        await resolver(root).rewritePaths('local');

        context.expect(await File.read(Path.join(root, 'dist', 'styles.css'), 'utf-8')).equals(IMPORT);
        context.expect(await File.read(Path.join(root, 'dist', 'notes.txt'), 'utf-8')).equals(IMPORT);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports the count of the files it really rewrote', async (context) => {
    const dir = await createTemp();
    try {
        const root = await project(dir, 'app.js');
        await File.write(Path.join(root, 'dist', 'plain.js'), "import x from 'plain/pkg';");

        const lines: string[] = [];
        await resolver(root, lines).rewritePaths('local');

        context.expect(lines.some(line => line.includes('&C2Path aliases resolved in &C31 &C2files'))).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('warns and rewrites nothing when the out directory does not exist', async (context) => {
    const dir = await createTemp();
    try {
        const root = Path.join(dir, 'project');
        await File.ensureDir(root);

        const lines: string[] = [];
        await resolver(root, lines).rewritePaths('local');

        context.expect(lines.some(line => line.includes('not found'))).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('fails the command when a built file cannot be rewritten', async (context) => {
    const dir = await createTemp();
    const locked = { file: '' };
    try {
        const root = await project(dir, 'app.js');
        locked.file = Path.join(root, 'dist', 'locked.js');
        await File.write(locked.file, IMPORT);
        if (!await lockFile(locked.file)) {
            context.warn('this environment writes through a read-only file, the failure cannot be produced here');
            context.done('skipped: the environment denies no write');
            return;
        }

        try {
            await resolver(root).rewritePaths('local');
            context.fail('expected the command to fail a file it could not rewrite');
        } catch (error) {
            const message = (error as Error).message;
            context.expect(message).includes('1 of 2 file(s)');
            context.expect(message).includes('locked.js');
        }
        context.done();
    } finally {
        if (locked.file) await unlockFile(locked.file).catch(() => { });
        await removeTemp(dir);
    }
});

suite.add('keeps rewriting the rest of the files when one of them fails', async (context) => {
    const dir = await createTemp();
    const locked = { file: '' };
    try {
        const root = await project(dir, 'app.js');
        locked.file = Path.join(root, 'dist', 'locked.js');
        await File.write(locked.file, IMPORT);
        if (!await lockFile(locked.file)) {
            context.warn('this environment writes through a read-only file, the failure cannot be produced here');
            context.done('skipped: the environment denies no write');
            return;
        }

        try { await resolver(root).rewritePaths('local'); }
        catch (error) { context.expect((error as Error).message).includes('locked.js'); }

        context.expect(await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8')).includes('src/utils');
        context.done();
    } finally {
        if (locked.file) await unlockFile(locked.file).catch(() => { });
        await removeTemp(dir);
    }
});

suite.add('rewrites a changed file in the watcher session', async (context) => {
    const dir = await createTemp();
    const close = captureWatcher();
    try {
        const root = await project(dir, 'app.cjs');
        const instance = resolver(root);
        try {
            await instance.watch('local');
        } catch (error) {
            context.warn(`a recursive watcher is unavailable here: ${(error as Error).message}`);
            context.done('skipped: this platform has no recursive file watcher');
            return;
        }

        await File.write(Path.join(root, 'dist', 'app.cjs'), IMPORT);
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const content = await File.read(Path.join(root, 'dist', 'app.cjs'), 'utf-8');
            if (content !== IMPORT) { context.expect(content).includes('src/utils'); context.done(); return; }
            await context.sleep(150);
        }
        context.fail('the watcher did not rewrite the changed file');
    } finally {
        close();
        await removeTemp(dir);
    }
});

suite.add('compiles the aliases of the dependencies and of the config', async (context) => {
    const dir = await createTemp();
    try {
        const root = await project(dir, 'app.js', "import alpha from '@alpha';\nimport utils from '@utils';");
        const config = schema.Config.process({
            outDir: 'dist',
            dependencies: [{ name: 'alpha', repo: 'https://github.com/netfeez/alpha.git', resolver: { '@alpha': '.depflow/alpha' } }],
            resolver: RESOLVER
        });
        await new PathResolver(config, root).rewritePaths('local');

        const content = await File.read(Path.join(root, 'dist', 'app.js'), 'utf-8');
        context.expect(content).equals("import alpha from '../.depflow/alpha';\nimport utils from '../src/utils';");
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

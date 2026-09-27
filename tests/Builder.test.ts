/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the Builder: transformation replacer and build steps.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import Builder from '../src/builder/Builder.js';
import schema from '../src/schema/schema.js';
import { blockingScript, createTemp, removeTemp } from './utils.js';

/**
 * Exposes the protected static {@link Builder.replacer} for unit testing.
 */
class Replacer extends Builder {

    /**
     * Compiles a transform definition into a string transformer.
     * @param transform - The transform definition to compile.
     * @returns The compiled transformer.
     **/
    public static transform(transform?: schema.Transform): Builder.Transformer {
        return Builder.replacer(transform);
    }
}

const suite = new TestSuite('builder');

/**
 * Builds a pipeline the way a config does, so the defaults of every step are resolved.
 * @param entries - The steps of the pipeline.
 * @returns The processed pipeline.
 *
 * @remarks The steps come from an unknown document on purpose: the typed input of the schema is
 * exercised by the config suite, which processes a whole config, and not by a step at a time.
 **/
function pipeline(...entries: unknown[]): schema.Builder { return schema.Builder.processUnknown(entries); }

suite.add('string transform removes every occurrence', (context) => {
    const transformer = Replacer.transform('foo');
    context.expect(transformer('foo bar foo')).equals(' bar ');
    context.done();
});

suite.add('object transform substitutes matches', (context) => {
    const transformer = Replacer.transform({ search: 'foo', replace: 'bar', flags: 'g' });
    context.expect(transformer('foo foo')).equals('bar bar');
    context.done();
});

suite.add('object transform honors regex flags', (context) => {
    const transformer = Replacer.transform({ search: 'foo', flags: 'gi', replace: 'x' });
    context.expect(transformer('FOO foo')).equals('x x');
    context.done();
});

suite.add('transform without a definition returns the identity', (context) => {
    const transformer = Replacer.transform(undefined);
    context.expect(transformer('unchanged')).equals('unchanged');
    context.done();
});

suite.add('object transform without a replacement removes matches', (context) => {
    const transformer = Replacer.transform({ search: 'x', replace: '', flags: 'g' });
    context.expect(transformer('x1x2')).equals('12');
    context.done();
});

suite.add('runs every command of a run step in order', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, pipeline: pipeline({ run: [ 'node -e "require(\'fs\').writeFileSync(\'one.txt\', \'1\')"', 'node -e "require(\'fs\').writeFileSync(\'two.txt\', \'2\')"' ] }) });
        await builder.run();
        context.expect(await File.exists(Path.join(dir, 'one.txt'))).ok();
        context.expect(await File.exists(Path.join(dir, 'two.txt'))).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('stops the pipeline after a run step that does not tolerate its failure', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({
            cwd: dir,
            pipeline: pipeline(
                { run: 'node -e "process.exit(1)"' },
                { run: 'node -e "require(\'fs\').writeFileSync(\'after.txt\', \'after\')"' }
            )
        });
        try {
            await builder.run();
            context.fail('expected the build to reject a failing run step');
        } catch (error) {
            context.expect((error as Error).message).includes('status 1');
        }
        context.expect(await File.exists(Path.join(dir, 'after.txt'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('tolerates a failing run step that allows fails', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({
            cwd: dir,
            pipeline: pipeline({ run: 'node -e "process.exit(1)"', allowFails: true }, { run: 'node -e "require(\'fs\').writeFileSync(\'after.txt\', \'after\')"' })
        });
        await builder.run();
        context.expect(await File.exists(Path.join(dir, 'after.txt'))).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('fails the build when the deadline of a run step is reached', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, pipeline: pipeline({ run: blockingScript(), maxTimeMs: 500 }) });
        const started = Date.now();
        try {
            await builder.run();
            context.fail('expected the build to reject once the deadline is reached');
        } catch (error) {
            context.expect((error as Error).message).includes('timed out');
            context.expect(Date.now() - started < 30000).equals(true);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('does not tolerate a deadline that a step allows fails for', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, pipeline: pipeline({ run: blockingScript(), maxTimeMs: 500, allowFails: true }) });
        try {
            await builder.run();
            context.fail('expected the build to reject once the deadline is reached');
        } catch (error) {
            context.expect((error as Error).message).includes('timed out');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('extracts files to a destination relative to the build', async (context) => {
    const dir = await createTemp();
    try {
        await File.write(Path.join(dir, 'index.js'), 'export const value = 1;');
        const builder = new Builder({ cwd: dir, pipeline: pipeline({ extract: { '**/*.js': { to: 'lib' } } }) });
        await builder.run();
        context.expect(await File.read(Path.join(dir, 'lib', 'index.js'), 'utf-8')).equals('export const value = 1;');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('transforms the files a glob matches', async (context) => {
    const dir = await createTemp();
    try {
        await File.write(Path.join(dir, 'index.js'), 'const value = "keep";');
        const builder = new Builder({ cwd: dir, pipeline: pipeline({ transform: { glob: '**/*.js', search: '"keep"', replace: '"replaced"' } }) });
        await builder.run();
        context.expect(await File.read(Path.join(dir, 'index.js'), 'utf-8')).equals('const value = "replaced";');
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
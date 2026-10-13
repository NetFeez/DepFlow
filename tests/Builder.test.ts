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

suite.add('runs every command of a run step in order, and returns the report of the build', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, projectRoot: dir, pipeline: pipeline({ run: [ 'node -e "require(\'fs\').writeFileSync(\'one.txt\', \'1\')"', 'node -e "require(\'fs\').writeFileSync(\'two.txt\', \'2\')"' ] }) });
        const report = await builder.run();
        context.expect(await File.exists(Path.join(dir, 'one.txt'))).ok();
        context.expect(await File.exists(Path.join(dir, 'two.txt'))).ok();
        context.expect(report.ok).equals(true);
        context.expect(report.commands).equals(2);
        context.expect(report.failed).equals(0);
        context.expect(report.steps[0].commands.map(command => command.ordinal).join(' ')).equals('1 2');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('stops the pipeline after a run step that does not tolerate its failure', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({
            cwd: dir,
            projectRoot: dir,
            pipeline: pipeline(
                { run: 'node -e "process.exit(1)"' },
                { run: 'node -e "require(\'fs\').writeFileSync(\'after.txt\', \'after\')"' }
            )
        });
        try {
            await builder.run();
            context.fail('expected the build to reject a failing run step');
        } catch (error) {
            context.expect(error).instanceOf(Builder.Failure);
            const failure = error as Builder.Failure;
            context.expect(failure.reason).equals('command');
            context.expect(failure.report.ok).equals(false);
            context.expect(failure.report.steps[0].commands[0].code).equals(1);
            context.expect(failure.report.steps[0].commands[0].reason).equals(null);
            context.expect(failure.report.steps[1].ran).equals(false);
            context.expect(failure.report.steps[1].commands.length).equals(0);
        }
        context.expect(await File.exists(Path.join(dir, 'after.txt'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('and 29.5.37 tolerates a failing run step that allows fails', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({
            cwd: dir,
            projectRoot: dir,
            pipeline: pipeline({ run: 'node -e "process.exit(1)"', allowFails: true }, { run: 'node -e "require(\'fs\').writeFileSync(\'after.txt\', \'after\')"' })
        });
        const report = await builder.run();
        context.expect(await File.exists(Path.join(dir, 'after.txt'))).ok();
        context.expect(report.ok).equals(true);
        context.expect(report.failed).equals(1);
        context.expect(report.tolerated).equals(1);
        context.expect(report.steps[0].tolerated).equals(true);
        context.expect(report.steps[0].commands[0].success).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('fails the build when the deadline of a run step is reached', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, projectRoot: dir, pipeline: pipeline({ run: blockingScript(), maxTimeMs: 500 }) });
        const started = Date.now();
        try {
            await builder.run();
            context.fail('expected the build to reject once the deadline is reached');
        } catch (error) {
            context.expect(error).instanceOf(Builder.Failure);
            const failure = error as Builder.Failure;
            context.expect(failure.reason).equals('timeout');
            context.expect(failure.report.steps[0].reason).equals('timeout');
            context.expect(failure.report.steps[0].commands[0].reason).equals('timeout');
            context.expect(Date.now() - started < 30000).equals(true);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('does not tolerate a deadline that a step allows fails for', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, projectRoot: dir, pipeline: pipeline({ run: blockingScript(), maxTimeMs: 500, allowFails: true }) });
        try {
            await builder.run();
            context.fail('expected the build to reject once the deadline is reached');
        } catch (error) {
            context.expect(error).instanceOf(Builder.Failure);
            context.expect((error as Builder.Failure).reason).equals('timeout');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs every instruction of a run step even after one of them fails', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({
            cwd: dir,
            projectRoot: dir,
            pipeline: pipeline({ run: [ 'node -e "process.exit(1)"', 'node -e "require(\'fs\').writeFileSync(\'after.txt\', \'after\')"' ] })
        });
        try { await builder.run(); context.fail('expected the build to reject a failing command'); }
        catch (error) {
            const report = (error as Builder.Failure).report;
            context.expect(report.steps[0].commands.length).equals(2);
            context.expect(report.steps[0].commands[1].success).equals(true);
        }
        context.expect(await File.exists(Path.join(dir, 'after.txt'))).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('keeps the captured output out of the report of a command', async (context) => {
    const dir = await createTemp();
    try {
        const builder = new Builder({ cwd: dir, projectRoot: dir, pipeline: pipeline({ run: 'node -e "console.log(\'kept in the evidence only\')"' }) });
        const report = await builder.run();
        const command = report.steps[0].commands[0] as unknown as Record<string, unknown>;
        context.expect(Object.keys(command).includes('stdout')).equals(false);
        context.expect(Object.keys(command).includes('stderr')).equals(false);
        context.expect(Object.keys(command).join(' ')).equals('ordinal label success code signal reason time');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('extracts files to a destination relative to the build', async (context) => {
    const dir = await createTemp();
    try {
        await File.write(Path.join(dir, 'index.js'), 'export const value = 1;');
        const builder = new Builder({ cwd: dir, projectRoot: dir, pipeline: pipeline({ extract: { '**/*.js': { to: 'lib' } } }) });
        await builder.run();
        context.expect(await File.read(Path.join(dir, 'lib', 'index.js'), 'utf-8')).equals('export const value = 1;');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('extracts to a destination relative to the project, not to the folder the build works in', async (context) => {
    const dir = await createTemp();
    try {
        const checkout = Path.join(dir, '.depflow', 'omega');
        const project = Path.join(dir, 'project');
        await File.ensureDir(Path.join(checkout, 'build'));
        await File.ensureDir(project);
        await File.write(Path.join(checkout, 'build', 'index.js'), 'export const value = 1;');

        const builder = new Builder({
            cwd: checkout,
            projectRoot: project,
            pipeline: pipeline({ extract: { 'build/**/*.js': { to: 'public/lib/omega', map: '^build/' } } })
        });
        await builder.run();

        context.expect(await File.read(Path.join(project, 'public', 'lib', 'omega', 'index.js'), 'utf-8')).equals('export const value = 1;');
        context.expect(await File.exists(Path.join(checkout, 'public'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('refuses a relative destination that walks out of the project', async (context) => {
    const dir = await createTemp();
    try {
        const checkout = Path.join(dir, '.depflow', 'omega');
        const project = Path.join(dir, 'project');
        await File.ensureDir(Path.join(checkout, 'build'));
        await File.ensureDir(project);
        await File.write(Path.join(checkout, 'build', 'index.js'), 'export const value = 1;');

        const builder = new Builder({
            cwd: checkout,
            projectRoot: project,
            pipeline: pipeline({ extract: { 'build/**/*.js': { to: '../escaped' } } })
        });
        try {
            await builder.run();
            context.fail('expected the build to reject a destination outside the project');
        } catch (error) {
            context.expect((error as Error).message).includes('outside of the project root');
        }
        context.expect(await File.exists(Path.join(dir, 'escaped'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('extracts to the project root itself when the destination says so', async (context) => {
    const dir = await createTemp();
    try {
        const checkout = Path.join(dir, '.depflow', 'omega');
        const project = Path.join(dir, 'project');
        await File.ensureDir(Path.join(checkout, 'build'));
        await File.ensureDir(project);
        await File.write(Path.join(checkout, 'build', 'index.js'), 'export const value = 1;');

        const builder = new Builder({
            cwd: checkout,
            projectRoot: project,
            pipeline: pipeline({ extract: { 'build/**/*.js': { to: '.', map: '^build/' } } })
        });
        await builder.run();

        context.expect(await File.read(Path.join(project, 'index.js'), 'utf-8')).equals('export const value = 1;');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('extracts to an absolute destination outside the project as it stands', async (context) => {
    const dir = await createTemp();
    try {
        const checkout = Path.join(dir, '.depflow', 'omega');
        const project = Path.join(dir, 'project');
        const elsewhere = Path.join(dir, 'elsewhere');
        await File.ensureDir(Path.join(checkout, 'build'));
        await File.ensureDir(project);
        await File.write(Path.join(checkout, 'build', 'index.js'), 'export const value = 1;');

        const builder = new Builder({
            cwd: checkout,
            projectRoot: project,
            pipeline: pipeline({ extract: { 'build/**/*.js': { to: elsewhere, map: '^build/' } } })
        });
        await builder.run();

        context.expect(await File.read(Path.join(elsewhere, 'index.js'), 'utf-8')).equals('export const value = 1;');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('transforms the files a glob matches', async (context) => {
    const dir = await createTemp();
    try {
        await File.write(Path.join(dir, 'index.js'), 'const value = "keep";');
        const builder = new Builder({ cwd: dir, projectRoot: dir, pipeline: pipeline({ transform: { glob: '**/*.js', search: '"keep"', replace: '"replaced"' } }) });
        await builder.run();
        context.expect(await File.read(Path.join(dir, 'index.js'), 'utf-8')).equals('const value = "replaced";');
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the identity, containment and acquisition of git and npm dependencies.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import DepUtils from '../src/dependency/DepUtils.js';
import GitDependency from '../src/dependency/GitDependency.js';
import NpmDependency from '../src/dependency/NpmDependency.js';
import Builder from '../src/builder/Builder.js';
import Task from '../src/task/Task.js';
import schema from '../src/schema/schema.js';
import { createGitFixture, createTemp, removeTemp, run } from './utils.js';

const suite = new TestSuite('dependency source');

/** The data of a git dependency, with the defaults the schema resolves for it. **/
function git(name: string, extra: Record<string, unknown> = {}): schema.Dependency.GitDependency {
    return schema.Dependency.GitDependency.process({ name, repo: 'https://github.com/netfeez/omega.git', ...extra });
}

/** The data of an npm dependency, with the defaults the schema resolves for it. **/
function npm(name: string, extra: Record<string, unknown> = {}): schema.Dependency.NpmDependency {
    return schema.Dependency.NpmDependency.process({ name, version: '1.0.0', ...extra });
}

/**
 * Whether the schema rejects a name, so a case is proven instead of being swallowed.
 *
 * @remarks An assertion raised inside a `try` whose `catch` is empty never fails the test: the catch
 * receives the assertion itself. The rejection is therefore answered as a value, and asserted where
 * nothing can intercept it.
 * @param name - The name to try.
 * @returns `true` when the schema refused the name.
 **/
function rejectsName(name: string): boolean {
    try { git(name); return false; }
    catch { return true; }
}

/**
 * Whether {@link DepUtils.repo} rejects a value, so a case is proven instead of being swallowed.
 * @param repo - The repository value to try.
 * @returns `true` when the value was refused.
 * @see rejectsName
 **/
function rejectsRepo(repo: unknown): boolean {
    try { DepUtils.repo(repo); return false; }
    catch { return true; }
}

suite.add('rejects a name that is a path', async (context) => {
    const dir = await createTemp();
    try {
        for (const name of [ '../../pwned', 'nested/name', '..', '.', '/absolute' ])
            context.expect(rejectsName(name)).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects a name that is hidden or reserved', async (context) => {
    const dir = await createTemp();
    try {
        for (const name of [ '.hidden', 'schema.json', 'node_modules' ])
            context.expect(rejectsName(name)).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('accepts the names a source can be known by', async (context) => {
    const dir = await createTemp();
    try {
        for (const name of [ 'omega', 'netfeez.omega', 'my-lib_2.0', 'test.git' ]) {
            context.expect(git(name).name).equals(name);
        }
        context.expect(npm('@netfeez/common-node').name).equals('@netfeez/common-node');
        context.expect(npm('is-number').name).equals('is-number');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('keeps the folder of a dependency inside the flow folder', async (context) => {
    const dir = await createTemp();
    try {
        const flow = Path.join(dir, '.depflow');
        context.expect(new GitDependency(flow, dir, git('omega')).folder).equals(Path.join(flow, 'omega'));
        context.expect(new NpmDependency(flow, dir, npm('is-number')).folder).equals(Path.join(flow, 'node_modules', 'is-number'));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('refuses to resolve a name that escapes the flow folder', async (context) => {
    const dir = await createTemp();
    try {
        const flow = Path.join(dir, '.depflow');
        const escaped = git('omega');
        const dependency = new GitDependency(flow, dir, escaped);
        Object.defineProperty(dependency, 'name', { value: '../pwned' });
        try {
            dependency.folder;
            context.fail('expected a name escaping the flow folder to be rejected');
        } catch (error) {
            context.expect((error as Error).message).includes('outside of the flow folder');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('refuses to remove a clone outside of the flow folder', async (context) => {
    const dir = await createTemp();
    try {
        const flow = Path.join(dir, '.depflow');
        const outside = Path.join(dir, 'precious');
        await File.ensureDir(outside);
        await File.write(Path.join(outside, 'keep.txt'), 'keep');

        const dependency = new GitDependency(flow, dir, git('omega'));
        Object.defineProperty(dependency, 'name', { value: '../precious' });
        try {
            await dependency.uninstall();
            context.fail('expected the removal outside of the flow folder to be rejected');
        } catch (error) {
            context.expect((error as Error).message).includes('outside of the flow folder');
        }
        context.expect(await File.exists(outside)).ok();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('reports whether a dependency is installed', async (context) => {
    const dir = await createTemp();
    try {
        const flow = Path.join(dir, '.depflow');
        const gitDependency = new GitDependency(flow, dir, git('omega'));
        const npmDependency = new NpmDependency(flow, dir, npm('is-number'));
        context.expect(await gitDependency.isInstalled()).equals(false);
        context.expect(await npmDependency.isInstalled()).equals(false);

        await File.ensureDir(gitDependency.folder);
        await File.ensureDir(npmDependency.folder);
        context.expect(await gitDependency.isInstalled()).equals(true);
        context.expect(await npmDependency.isInstalled()).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('clones a repository and checks out its tag', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, '.depflow');
        const dependency = new GitDependency(flow, dir, git('omega', { repo: origin, tag: 'v1' }));

        await dependency.install();

        context.expect(await File.exists(Path.join(dependency.folder, 'version.txt'))).ok();
        context.expect(await File.read(Path.join(dependency.folder, 'version.txt'), 'utf-8')).equals('v1');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('checks out the same tag when the clone already exists', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, '.depflow');
        const dependency = new GitDependency(flow, dir, git('omega', { repo: origin, tag: 'v1' }));
        await dependency.install();

        const work = Path.join(dir, 'work');
        await File.write(Path.join(work, 'version.txt'), 'v2');
        await run('git', [ 'commit', '-am', 'v2' ], work);
        await run('git', [ 'tag', 'v2' ], work);
        await run('git', [ 'push', 'origin', 'main', '--tags' ], work);

        await dependency.install();

        context.expect(await File.read(Path.join(dependency.folder, 'version.txt'), 'utf-8')).equals('v1');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('moves the checkout to the tag it declares when the declared one changes', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, '.depflow');
        const first = new GitDependency(flow, dir, git('omega', { repo: origin, tag: 'v1' }));
        await first.install();
        context.expect(await File.read(Path.join(first.folder, 'version.txt'), 'utf-8')).equals('v1');

        const work = Path.join(dir, 'work');
        await run('git', [ 'checkout', '-b', 'dev' ], work);
        await File.write(Path.join(work, 'version.txt'), 'dev');
        await run('git', [ 'commit', '-am', 'dev' ], work);
        await run('git', [ 'push', 'origin', 'dev' ], work);

        const second = new GitDependency(flow, dir, git('omega', { repo: origin, tag: 'dev' }));
        await second.install();

        context.expect(await File.read(Path.join(second.folder, 'version.txt'), 'utf-8')).equals('dev');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('runs the build pipeline of a dependency in its checkout', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, '.depflow');
        const dependency = new GitDependency(flow, dir, git('omega', {
            repo: origin,
            tag: 'v1',
            builder: [ { run: `node -e "require('fs').writeFileSync('built.txt', 'built')"` } ]
        }));

        await dependency.install();

        context.expect(await File.read(Path.join(dependency.folder, 'built.txt'), 'utf-8')).equals('built');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('extracts the artifacts of a dependency into the project, not into its checkout', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, '.depflow');
        const dependency = new GitDependency(flow, dir, git('omega', {
            repo: origin,
            tag: 'v1',
            builder: [
                { run: `node -e "require('fs').mkdirSync('build', { recursive: true });require('fs').writeFileSync('build/index.js', 'export const value = 1;')"` },
                { extract: { 'build/**/*.js': { to: 'public/lib/omega', map: '^build/' } } }
            ]
        }));

        await dependency.install();

        context.expect(await File.read(Path.join(dir, 'public', 'lib', 'omega', 'index.js'), 'utf-8')).equals('export const value = 1;');
        context.expect(await File.exists(Path.join(dependency.folder, 'public'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('fails the install when the build of the dependency fails', async (context) => {
    const dir = await createTemp();
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, '.depflow');
        const dependency = new GitDependency(flow, dir, git('omega', {
            repo: origin,
            tag: 'v1',
            builder: [ { run: 'node -e "process.exit(1)"' } ]
        }));

        try {
            await dependency.install();
            context.fail('expected the install to reject a failing build');
        } catch (error) {
            context.expect(error).instanceOf(Builder.Failure);
            const failure = error as Builder.Failure;
            context.expect(failure.report.steps[0].commands[0].code).equals(1);
            context.expect(failure.report.ok).equals(false);
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('installs a repository from a project whose path has spaces', async (context) => {
    const dir = await createTemp('depflow spaced project ');
    try {
        const origin = await createGitFixture(dir, 'v1');
        const flow = Path.join(dir, 'a flow folder');
        const dependency = new GitDependency(flow, dir, git('omega', { repo: origin, tag: 'v1' }));

        await dependency.install();

        context.expect(await File.read(Path.join(dependency.folder, 'version.txt'), 'utf-8')).equals('v1');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('fails the install when the repository cannot be cloned', async (context) => {
    const dir = await createTemp();
    try {
        const flow = Path.join(dir, '.depflow');
        const missing = Path.join(dir, 'no-such-repository.git');
        const dependency = new GitDependency(flow, dir, git('omega', { repo: missing }));

        try {
            await dependency.install();
            context.fail('expected the install to reject a repository that cannot be cloned');
        } catch (error) {
            context.expect(error).instanceOf(Task.Failure);
            const failure = error as Task.Failure;
            context.expect(failure.outcome.results[0].code).equals(128);
            context.expect(failure.outcome.results[0].diagnostic).includes('status 128');
            context.expect(failure.message.includes('status 128')).equals(false);
        }
        context.expect(await File.exists(Path.join(flow, 'omega', 'version.txt'))).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects a repository that is not clonable', async (context) => {
    const dir = await createTemp();
    try {
        for (const repo of [ '', '   ', 'not a url', 'https://github.com/netfeez/omega' ])
            context.expect(rejectsRepo(repo)).equals(true);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('accepts every transport git clones from', async (context) => {
    const dir = await createTemp();
    try {
        for (const repo of [
            'https://github.com/netfeez/omega.git',
            'http://example.com/omega.git',
            'ssh://git@example.com/omega.git',
            'git://example.com/omega.git',
            'file:///srv/repos/omega.git',
            'git@github.com:netfeez/omega.git',
            '/srv/repos/omega.git'
        ]) DepUtils.repo(repo);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('derives the name of a github repository only', async (context) => {
    const dir = await createTemp();
    try {
        context.expect(DepUtils.getRepoName('https://github.com/netfeez/omega.git')).equals('netfeez.omega');
        context.expect(DepUtils.getRepoName('https://github.com/netfeez/omega')).equals('netfeez.omega');
        context.expect(DepUtils.getRepoName('git@github.com:netfeez/omega.git')).equals('netfeez.omega');

        for (const repo of [ 'https://gitlab.com/netfeez/omega.git', '/srv/repos/omega.git' ]) {
            try {
                DepUtils.getRepoName(repo);
                context.fail(`expected "${repo}" to have no derivable name`);
            } catch (error) {
                context.expect((error as Error).message).includes('only GitHub');
                context.expect((error as Error).message).includes(repo);
            }
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('git uninstall removes the local clone', async (context) => {
    const dir = await createTemp();
    try {
        const target = Path.join(dir, '.depflow', 'test.git');
        await File.ensureDir(target);
        await File.write(Path.join(target, 'file.txt'), 'content');

        const dep = new GitDependency(Path.join(dir, '.depflow'), dir, git('test.git'));
        await dep.uninstall();

        context.expect(await File.exists(target)).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('git uninstall is idempotent over a missing clone', async (context) => {
    const dir = await createTemp();
    try {
        const dep = new GitDependency(Path.join(dir, '.depflow'), dir, git('test.git'));
        await dep.uninstall();
        await dep.uninstall();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('npm uninstall removes the installed package folder', async (context) => {
    const dir = await createTemp();
    try {
        const target = Path.join(dir, '.depflow', 'node_modules', 'test-pkg');
        await File.ensureDir(target);
        await File.write(Path.join(target, 'index.js'), 'export {}');

        const dep = new NpmDependency(Path.join(dir, '.depflow'), dir, npm('test-pkg'));
        await dep.uninstall();

        context.expect(await File.exists(target)).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('npm uninstall is idempotent over a missing package', async (context) => {
    const dir = await createTemp();
    try {
        const dep = new NpmDependency(Path.join(dir, '.depflow'), dir, npm('test-pkg'));
        await dep.uninstall();
        await dep.uninstall();
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

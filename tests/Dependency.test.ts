/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the remove-implies-uninstall semantics of git and npm dependencies.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import GitDependency from '../src/dependency/GitDependency.js';
import NpmDependency from '../src/dependency/NpmDependency.js';
import schema from '../src/schema/schema.js';
import { createTemp, removeTemp } from './utils.js';

const suite = new TestSuite('dependency uninstall');

suite.add('git uninstall removes the local clone', async (context) => {
    const dir = await createTemp();
    try {
        const target = Path.join(dir, '.depflow', 'test.git');
        await File.ensureDir(target);
        await File.write(Path.join(target, 'file.txt'), 'content');

        const data = schema.Dependency.GitDependency.process({ name: 'test.git', repo: 'https://github.com/netfeez/test.git' });
        const dep = new GitDependency(Path.join(dir, '.depflow'), data);
        await dep.uninstall();

        context.expect(await File.exists(target)).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('git uninstall is idempotent over a missing clone', async (context) => {
    const dir = await createTemp();
    try {
        const data = schema.Dependency.GitDependency.process({ name: 'test.git', repo: 'https://github.com/netfeez/test.git' });
        const dep = new GitDependency(Path.join(dir, '.depflow'), data);
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

        const data = schema.Dependency.NpmDependency.process({ name: 'test-pkg', version: '1.0.0' });
        const dep = new NpmDependency(Path.join(dir, '.depflow'), data);
        await dep.uninstall();

        context.expect(await File.exists(target)).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('npm uninstall is idempotent over a missing package', async (context) => {
    const dir = await createTemp();
    try {
        const data = schema.Dependency.NpmDependency.process({ name: 'test-pkg', version: '1.0.0' });
        const dep = new NpmDependency(Path.join(dir, '.depflow'), data);
        await dep.uninstall();
        await dep.uninstall();
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
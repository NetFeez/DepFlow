/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Structural tests for the import path rewriting against compiled aliases.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { Path } from '@netfeez/common-node';

import PathRewriter from '../src/resolve/PathRewriter.js';
import AliasCompiler from '../src/resolve/AliasCompiler.js';
import schema from '../src/schema/schema.js';

const suite = new TestSuite('path rewriter');
const projectRoot = Path.resolve('test-project');

/**
 * Rewrites a source snippet using the test project aliases.
 * @param content - The file content to rewrite.
 * @param filePath - The path of the file being processed.
 * @param mode - The target resolution mode.
 * @param resolver - The resolver mapping to compile into aliases.
 * @returns The rewritten content.
 **/
function rewrite(
    content: string,
    filePath: string,
    mode: 'local' | 'cdn' = 'local',
    resolver: schema.Resolver = {
        '@utils': 'src/utils',
        'components/*': 'packages/components',
        '@cdn': { local: 'src/cdn', type: 'src/cdn.d.ts', cdn: 'https://cdn.example/lib' }
    }
): string {
    const config = schema.Config.process({ resolver });
    const aliases = new AliasCompiler(projectRoot).compile(config);
    return new PathRewriter(aliases).rewrite(content, filePath, mode);
}

/**
 * Normalizes path separators for portable comparisons.
 * @param value - The path to normalize.
 * @returns The path written with forward slashes.
 **/
function normalized(value: string): string { return value.replace(/\\/g, '/'); }

suite.add('leaves non-alias imports untouched', (context) => {
    const content = "import x from 'plain/pkg';";
    context.expect(rewrite(content, Path.join(projectRoot, 'src', 'main.ts'))).equals(content);
    context.done();
});

suite.add('rewrites an exact alias to a relative local path', (context) => {
    const out = rewrite("import x from '@utils';", Path.join(projectRoot, 'src', 'main.ts'));
    context.expect(normalized(out)).equals("import x from './utils';");
    context.done();
});

suite.add('computes parent-relative paths across directories', (context) => {
    const out = rewrite("import x from '@utils';", Path.join(projectRoot, 'lib', 'main.ts'));
    context.expect(normalized(out)).equals("import x from '../src/utils';");
    context.done();
});

suite.add('uses the cdn target in cdn mode', (context) => {
    const out = rewrite("import x from '@cdn';", Path.join(projectRoot, 'src', 'main.ts'), 'cdn');
    context.expect(normalized(out)).equals("import x from 'https://cdn.example/lib';");
    context.done();
});

suite.add('appends the wildcard subpath in local mode', (context) => {
    const out = rewrite("import x from 'components/Button';", Path.join(projectRoot, 'src', 'main.ts'));
    context.expect(normalized(out)).equals("import x from '../packages/components/Button';");
    context.done();
});

suite.add('appends the wildcard subpath in cdn mode', (context) => {
    const out = rewrite(
        "import x from 'cdn/Button';",
        Path.join(projectRoot, 'src', 'main.ts'),
        'cdn',
        { 'cdn/*': { local: 'src/cdn', cdn: 'https://cdn.example/cdn' } }
    );
    context.expect(normalized(out)).equals("import x from 'https://cdn.example/cdn/Button';");
    context.done();
});

suite.add('does not match a wildcard alias without its prefix', (context) => {
    const out = rewrite("import x from 'components';", Path.join(projectRoot, 'src', 'main.ts'));
    context.expect(normalized(out)).equals("import x from 'components';");
    context.done();
});

export default suite;
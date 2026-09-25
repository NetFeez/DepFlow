/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Structural tests for the alias compilation from resolver entries.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { Path } from '@netfeez/common-node';

import AliasCompiler from '../src/resolve/AliasCompiler.js';
import schema from '../src/schema/schema.js';

const suite = new TestSuite('alias compiler');
const projectRoot = Path.resolve('test-project');

/**
 * Compiles a resolver mapping against the fixed test project root.
 * @param resolver - The resolver mapping of aliases to targets.
 * @returns The compiled aliases.
 **/
function compile(resolver: schema.Resolver): AliasCompiler.CompiledAlias[] {
    const config = schema.Config.process({ resolver });
    return new AliasCompiler(projectRoot).compile(config);
}

suite.add('collects dependency resolvers and the base resolver', (context) => {
    const config = schema.Config.process({
        dependencies: [
            { name: 'git.dep', repo: 'https://github.com/netfeez/git.git', resolver: { '@git': 'src/git' } }
        ],
        npmDependencies: [
            { name: 'npm-pkg', version: '1.0.0', resolver: { '@npm': 'src/npm' } }
        ],
        resolver: { '@base': 'src/base' }
    });
    const aliases = new AliasCompiler(projectRoot).compile(config);
    context.expect(aliases.length).equals(3);
    context.done();
});

suite.add('flags wildcard aliases and strips their suffix', (context) => {
    const aliases = compile({ 'components/*': 'packages/components' });
    context.expect(aliases.length).equals(1);
    context.expect(aliases[0].isWildcard).ok();
    context.expect(aliases[0].alias).equals('components');
    context.done();
});

suite.add('resolves relative local targets against the project root', (context) => {
    const aliases = compile({ '@utils': 'src/utils' });
    context.expect(aliases[0].targets.local).equals(Path.join(projectRoot, 'src', 'utils'));
    context.done();
});

suite.add('keeps absolute targets untouched by the project root', (context) => {
    const lib = Path.resolve('lib');
    const aliases = compile({ '@abs/*': `${lib}/*` });
    context.expect(aliases[0].isWildcard).ok();
    context.expect(aliases[0].alias).equals('@abs');
    context.expect(aliases[0].targets.local).equals(lib);
    context.done();
});

suite.add('captures local, type and cdn targets of object targets', (context) => {
    const aliases = compile({ '@cdn': { local: 'src/cdn', type: 'src/cdn.d.ts', cdn: 'https://cdn.example/lib' } });
    const target = aliases[0].targets;
    context.expect(target.local).equals(Path.join(projectRoot, 'src', 'cdn'));
    context.expect(target.type).equals('src/cdn.d.ts');
    context.expect(target.cdn).equals('https://cdn.example/lib');
    context.done();
});

suite.add('skips dependencies without a resolver', (context) => {
    const config = schema.Config.process({
        dependencies: [{ name: 'git.dep', repo: 'https://github.com/netfeez/git.git' }]
    });
    const aliases = new AliasCompiler(projectRoot).compile(config);
    context.expect(aliases.length).equals(0);
    context.done();
});

export default suite;
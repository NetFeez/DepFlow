/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Structural tests for the Builder transformation replacer.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';

import Builder from '../src/builder/Builder.js';
import schema from '../src/schema/schema.js';

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

const suite = new TestSuite('builder replacer');

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

export default suite;
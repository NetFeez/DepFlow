/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the CLI flag parser: value forms, boolean flags, terminator and declared defaults.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import type TestContext from '@TestSuite/TestContext.js';

import Flags from '../src/cli/Flags.js';

const suite = new TestSuite('cli flags');

const options = new Flags({
    flow: { type: 'string', default: 'depflow.json', aliases: ['f'] },
    name: { type: 'string' },
    watch: { type: 'boolean', aliases: ['w'] },
    cdn: { type: 'boolean', default: false }
});

/**
 * Asserts that parsing the given arguments fails with the expected message.
 * @param context - The context of the test.
 * @param args - The command-line arguments to parse.
 * @param message - The expected failure message.
 **/
function fails(context: TestContext, args: string[], message: string): void {
    try {
        options.parse(args);
        context.fail(`expected the parsing to reject: ${args.join(' ')}`);
    } catch (error) {
        context.expect((error as Error).message).equals(message);
    }
}

suite.add('collects the positional arguments in order', (context) => {
    const { args, flags } = options.parse([ 'install', 'alpha', 'beta' ]);
    context.expect(args.join(' ')).equals('install alpha beta');
    context.expect(flags.flow).equals('depflow.json');
    context.expect(flags.cdn).equals(false);
    context.done();
});

suite.add('reads a value flag from the next argument and from its inline form', (context) => {
    const separated = options.parse([ '--flow', 'custom.json' ]);
    const inline = options.parse([ '--flow=custom.json' ]);
    const aliased = options.parse([ '-f', 'custom.json' ]);
    context.expect(separated.flags.flow).equals('custom.json');
    context.expect(inline.flags.flow).equals('custom.json');
    context.expect(aliased.flags.flow).equals('custom.json');
    context.done();
});

suite.add('keeps the last occurrence of a flag', (context) => {
    const { flags } = options.parse([ '--flow', 'first.json', '--flow=last.json' ]);
    context.expect(flags.flow).equals('last.json');
    context.done();
});

suite.add('reads a boolean flag without consuming the next argument', (context) => {
    const { args, flags } = options.parse([ 'rewrite-paths', '--watch', 'alpha' ]);
    context.expect(args.join(' ')).equals('rewrite-paths alpha');
    context.expect(flags.watch).equals(true);
    context.expect(flags.cdn).equals(false);
    context.done();
});

suite.add('reads the explicit value of a boolean flag', (context) => {
    const enabled = options.parse([ '--watch=true', '--cdn=true' ]);
    const disabled = options.parse([ '--watch', '--watch=false' ]);
    context.expect(enabled.flags.watch).equals(true);
    context.expect(enabled.flags.cdn).equals(true);
    context.expect(disabled.flags.watch).equals(false);
    context.done();
});

suite.add('rejects a value other than true or false on a boolean flag', (context) => {
    fails(context, [ '--watch=yes' ], 'Invalid boolean value: --watch=yes');
    context.done();
});

suite.add('stops at the terminator and keeps the remaining arguments positional', (context) => {
    const { args, flags } = options.parse([ 'install', '--', '--cdn', '-f', 'raw.json' ]);
    context.expect(args.join(' ')).equals('install --cdn -f raw.json');
    context.expect(flags.cdn).equals(false);
    context.expect(flags.flow).equals('depflow.json');
    context.done();
});

suite.add('treats a short token as a single flag', (context) => {
    fails(context, [ '-abc' ], 'Unknown flag: -abc');
    context.done();
});

suite.add('rejects a flag that is not declared', (context) => {
    fails(context, [ '--wathc' ], 'Unknown flag: --wathc');
    context.done();
});

suite.add('keeps the declared default when a value flag has no value left', (context) => {
    const followedByFlag = options.parse([ '--flow', '--cdn' ]);
    const emptyValue = options.parse([ '--flow=' ]);
    const inlineValue = options.parse([ '--flow=-dashed.json' ]);
    context.expect(followedByFlag.flags.flow).equals('depflow.json');
    context.expect(followedByFlag.flags.cdn).equals(true);
    context.expect(emptyValue.flags.flow).equals('');
    context.expect(inlineValue.flags.flow).equals('-dashed.json');
    context.done();
});

suite.add('leaves a flag without a declared default absent', (context) => {
    const { flags } = options.parse([]);
    context.expect(flags.name).equals(undefined);
    context.expect(flags.watch).equals(undefined);
    context.expect(Object.keys(options.defaults).join(' ')).equals('flow cdn');
    context.expect(options.defaults.flow).equals('depflow.json');
    context.done();
});

suite.add('rejects a declaration accepting the same name twice', (context) => {
    const duplicated = () => new Flags({ watch: { type: 'boolean' }, cdn: { type: 'boolean', aliases: ['watch'] } });
    const dashed = () => new Flags({ watch: { type: 'boolean', aliases: ['-w'] } });
    try {
        duplicated();
        context.fail('expected the declaration to reject a duplicated name');
    } catch (error) { context.expect((error as Error).message).equals('Duplicated flag name: watch'); }
    try {
        dashed();
        context.fail('expected the declaration to reject a dashed alias');
    } catch (error) { context.expect((error as Error).message).equals('Flag name must not carry a dash prefix: -w'); }
    context.done();
});

export default suite;

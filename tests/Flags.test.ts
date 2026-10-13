/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the CLI flag parser: value forms, boolean flags, terminator and
 *              declared defaults, and the three flags the modes of a run are asked for with.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import type TestContext from '@TestSuite/TestContext.js';

import { options as modes } from '../src/cli/DepflowCLI.js';
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

/**
 * Asserts that the declaration of the CLI itself rejects the given arguments with the expected message.
 *
 * @remarks The modes of a run are declared in the CLI and not in a fixture, so what a case claims about
 * them is claimed about the declaration a user actually gets.
 *
 * @param context - The context of the test.
 * @param args - The command-line arguments to parse.
 * @param message - The expected failure message.
 **/
function modesFail(context: TestContext, args: string[], message: string): void {
    try {
        modes.parse(args);
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

//
// ====== The three flags the modes of a run are asked for with ======
//

suite.add('the CLI declares the three modes and the defaults the contract fixes', (context) => {
    // The three are declared, and nothing else came with them: the declaration of the CLI is the three
    // names it had plus these three, in this order.
    context.expect(Object.keys(modes.declaration).join(' ')).equals('flow watch cdn verbose silent decorate');
    context.expect(modes.declaration.verbose.type).equals('boolean');
    context.expect(modes.declaration.silent.type).equals('boolean');
    context.expect(modes.declaration.decorate.type).equals('boolean');

    // A command line that asks for nothing gets the three defaults, and `decorate` is the only flag of the
    // CLI whose absence is not the absence of something: off would be the mode, so it starts on.
    const absent = modes.parse([ 'run', 'check' ]);
    context.expect(absent.args.join(' ')).equals('run check');
    context.expect(absent.flags.verbose).equals(false);
    context.expect(absent.flags.silent).equals(false);
    context.expect(absent.flags.decorate).equals(true);

    const asked = modes.parse([ '--verbose', '--decorate=false' ]);
    context.expect(asked.flags.verbose).equals(true);
    context.expect(asked.flags.silent).equals(false);
    context.expect(asked.flags.decorate).equals(false);
    context.done();
});

suite.add('the misspelled mode does not exist and the short alias belongs to verbose alone', (context) => {
    modesFail(context, [ '--vervose' ], 'Unknown flag: --vervose');
    modesFail(context, [ 'run', 'check', '--vervose' ], 'Unknown flag: --vervose');

    // Every alias the CLI answers to, and the flag each of them reaches: the only one this phase adds is
    // `v`, and it reaches `verbose` and nothing else.
    const declaration: Flags.Declaration = modes.declaration;
    const aliases = Object.entries(declaration)
        .flatMap(([ name, flag ]) => (flag.aliases ?? []).map(alias => `${alias}->${name}`))
        .join(' ');
    context.expect(aliases).equals('p->flow f->flow w->watch v->verbose');

    const { flags } = modes.parse([ '-v' ]);
    context.expect(flags.verbose).equals(true);
    context.expect(flags.silent).equals(false);
    context.expect(flags.decorate).equals(true);
    context.expect(flags.flow).equals('depflow.yml');
    context.expect(flags.watch).equals(false);
    context.expect(flags.cdn).equals(false);
    context.done();
});

suite.add('a name the build does not declare is an error, and a mode gets no tolerated form', (context) => {
    modesFail(context, [ '--verbos' ], 'Unknown flag: --verbos');
    modesFail(context, [ '--silen' ], 'Unknown flag: --silen');
    modesFail(context, [ '--decorat' ], 'Unknown flag: --decorat');
    modesFail(context, [ '-V' ], 'Unknown flag: -V');

    // The strictness is the one the parser already had, and the modes are no exception to it: an older
    // build asked for `--silent` is answered with `Unknown flag: --silent` rather than running a mode
    // it does not have. What the modes do accept is the value form every boolean already accepted.
    context.expect(modes.parse([ '--silent' ]).flags.silent).equals(true);
    context.expect(modes.parse([ '--silent=false' ]).flags.silent).equals(false);
    context.expect(modes.parse([ '--decorate=false' ]).flags.decorate).equals(false);
    context.expect(modes.parse([ 'run', '--silent', 'check' ]).args.join(' ')).equals('run check');
    context.done();
});

export default suite;

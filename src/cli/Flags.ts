/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description CLI flag parsing: declarative flag definitions, command-line tokenization and typed value extraction.
 * @license Apache-2.0
 */
import Schema, { Definition } from '@netfeez/schema';

export class Flags<const D extends Flags.Declaration> {
    /** The declared flags, kept at their declared type so the parsed values are inferred from them. */
    public readonly declaration: D;

    /** Maps every accepted name, canonical or alias, to the name of the flag declaring it. */
    private readonly names: Map<string, string>;

    /**
     * Declares the flags accepted by a command line.
     * @param declaration - The declared flags, keyed by the name each one is declared under.
     * @throws { Error } When a name is declared or aliased twice, or when an alias carries a dash prefix.
     */
    public constructor(declaration: D) {
        this.declaration = declaration;
        this.names = Flags.index(declaration);
    }

    /** The values a parsed command line carries when a flag is absent, taken from the declared defaults. **/
    public get defaults(): Flags.Values<D> {
        const values: Record<string, unknown> = {};
        for (const [name, flag] of Object.entries(this.declaration)) {
            if ('default' in flag) values[name] = flag.default;
        }
        return values as Flags.Values<D>;
    }

    /** The values parsed from a command line. Type-only: accessing it at runtime throws. **/
    public get infer(): Flags.Values<D> { throw new Error('Flags.infer is type-only.'); }

    /**
     * Extracts the positional arguments and the flag values of a command line.
     * @param args - The command-line arguments.
     * @returns The positional arguments and the values of the declared flags.
     * @throws { Error } When a flag is not declared, or when a boolean flag carries a value other than "true" or "false".
     *
     * @remarks
     * A flag is the whole token, so short clusters are not expanded: `-abc` is the single flag `-abc`.
     * Names are matched without their dash prefix, so `-f` and `--flow` reach the same declaration.
     * A boolean flag never consumes the following argument and only accepts `=true` or `=false` inline.
     * A value flag takes the following argument as its value when that argument is not a flag; when it is,
     * the value has to be written inline as `--flag=value`. The `--` terminator moves every remaining token
     * to the positional arguments, and the last occurrence of a flag wins.
     *
     * @example
     * ```ts
     * const options = new Flags({
     *     flow: { type: 'string', default: 'depflow.yml', aliases: [ 'f' ] },
     *     cdn: { type: 'boolean', default: false }
     * });
     *
     * const { args, flags } = options.parse([ '-f', 'depflow.yml', 'install', '--cdn' ]);
     * // args  → [ 'install' ]
     * // flags → { flow: 'depflow.yml', cdn: true }
     * ```
     */
    public parse(args: readonly string[]): Flags.Result<Flags.Values<D>> {
        const positionals: string[] = [];
        const values: Record<string, unknown> = {};
        let parsing = true;
        let index = 0;

        while (parsing && index < args.length) {
            const arg = args[index++];
            if (arg === '--') { parsing = false; continue; }
            if (!Flags.isFlag(arg)) { positionals.push(arg); continue; }

            const separator = arg.indexOf('=');
            const name = this.resolve(separator < 0 ? arg : arg.slice(0, separator));
            if (name === undefined) throw new Error(`Unknown flag: ${arg}`);

            if (this.isBoolean(name)) {
                const value = separator < 0 ? 'true' : arg.slice(separator + 1);
                if (value !== 'true' && value !== 'false') throw new Error(`Invalid boolean value: ${arg}`);
                values[name] = value === 'true';
            } else if (separator >= 0) values[name] = arg.slice(separator + 1);
            else if (index < args.length && !Flags.isFlag(args[index])) values[name] = args[index++];
        }

        while (index < args.length) positionals.push(args[index++]);

        return { args: positionals, flags: { ...this.defaults, ...values } as Flags.Values<D> };
    }

    /**
     * Resolves the token of a flag to the name of the flag declaring it.
     * @param token - The token of the flag, without its inline value.
     * @returns The name the flag is declared under, or `undefined` when no declaration accepts the token.
     */
    private resolve(token: string): string | undefined {
        return this.names.get(token.replace(/^--?/, ''));
    }

    /**
     * Whether a declared flag carries a boolean value, meaning it never consumes the following argument.
     * @param name - The name the flag is declared under.
     * @returns Whether the flag is declared as a boolean.
     */
    private isBoolean(name: string): boolean {
        return this.declaration[name].type === 'boolean';
    }

    /** Whether an argument is a flag token, meaning a dash prefix longer than a single dash. **/
    private static isFlag(arg: string): boolean { return arg.length > 1 && arg.startsWith('-'); }

    /**
     * Builds the lookup of every accepted name, canonical or alias, to the name of the flag declaring it.
     * @param declaration - The declared flags.
     * @returns The lookup of accepted names to declared names.
     * @throws { Error } When a name is declared or aliased twice, or when an alias carries a dash prefix.
     */
    private static index(declaration: Flags.Declaration): Map<string, string> {
        const names = new Map<string, string>();
        for (const [name, flag] of Object.entries(declaration)) {
            for (const alias of [ name, ...flag.aliases ?? [] ]) {
                if (alias.startsWith('-')) throw new Error(`Flag name must not carry a dash prefix: ${alias}`);
                if (names.has(alias)) throw new Error(`Duplicated flag name: ${alias}`);
                names.set(alias, name);
            }
        }
        return names;
    }
}

export namespace Flags {
    /**
     * A declared flag: the definition of the value it carries, plus the extra names accepted for it.
     *
     * @remarks The parser honors `type`, `default` and `aliases`; `description` documents the flag.
     */
    export type Flag = (Definition.StringDef | Definition.BooleanDef) & {
        /** The extra names accepted for the flag, written without their dash prefix. */
        aliases?: readonly string[];
    };

    /** The declaration of the flags accepted by a command line, keyed by the name each flag is declared under. **/
    export type Declaration = { [name: string]: Flag };

    /** The value carried by a declared flag, derived from its definition through the schema inference. **/
    export type Value<F> = Schema.Output<Extract<F, Definition.Definition>>;

    /** The values of a declaration: every flag declaring a default is materialized, every other one is optional. **/
    export type Values<D> = {
        [K in keyof D as Defaulted<D[K]> extends true ? K : never]: Value<D[K]>
    } & {
        [K in keyof D as Defaulted<D[K]> extends true ? never : K]?: Value<D[K]>
    };

    /** The outcome of parsing a command line, carrying the values of the declared flags. **/
    export interface Result<V> {
        /** The positional arguments of the command line, in order. */
        args: string[];
        /** The values of the declared flags. */
        flags: V;
    }

    /** Whether a declared flag declares a default, meaning its value is always present in a parsed command line. **/
    type Defaulted<F> = F extends { default: unknown } ? true : false;
}

export default Flags;

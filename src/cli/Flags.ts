/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Extracts flags and positional arguments from a CLI argument list.
 * @license Apache-2.0
 */

export namespace Flags {
    export interface FlagMap {
        [flag: string]: string[];
    }

    export interface FlagResult {
        args: string[];
        flags: FlagMap;
    }

    /**
     * Extracts the positional arguments and flag values from a command-line argument list.
     * @param args - The command-line arguments.
     * @returns The positional arguments and a map of flags to their values.
     */
    export function extractFlags(args: string[]): FlagResult {
        const purifiedArgs: string[] = [];
        const flags: FlagMap = {};

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (!arg.startsWith('-')) {
                purifiedArgs.push(arg);
                continue;
            }

            let [key, value] = arg.split('=');

            if (value !== undefined) {
                if (!flags[key]) flags[key] = [];
                flags[key].push(value);
                continue;
            }

            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                if (!flags[key]) flags[key] = [];
                flags[key].push(nextArg);
                i++;
            } else {
                if (!flags[key]) flags[key] = [];
            }
        }

        return { args: purifiedArgs, flags };
    }
}

export default Flags;
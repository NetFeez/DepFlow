#!/usr/bin/env node
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Command-line entry point: parses arguments and dispatches the invoked command to the CLI.
 * @license Apache-2.0
 */
import Logger from "@netfeez/vterm";

import DepFlowCLI, { options } from "./DepFLowCLI.js";
import type Flags from "./Flags.js";

const skip = 2;
const [commandName, ...argsList] = process.argv.slice(skip);

/**
 * Reports a failure to the user and terminates the process with a non-zero exit code.
 * @param out - The logger the failure is reported to.
 * @param error - The failure, either an error or a message.
 */
function fail(out: Logger, error: any): never {
    out.error(`&C(#FFB4DC)╭─────────────────────────────────────────────`);
    out.error(`&C(#FFB4DC)│ &C1${error?.message || error}`);
    out.error(`&C(#FFB4DC)╰─────────────────────────────────────────────`);
    process.exit(1)
}

let parsed: Flags.Result<DepFlowCLI.Options>;
try { parsed = options.parse(argsList); }
catch (error: any) { fail(new Logger(), error); }

const { args, flags } = parsed;
const cli = new DepFlowCLI(flags.flow);

try {
    if (commandName !== null) {
        const command = cli.getCommand(commandName);
        if (command) {
            const exec = command.exec as DepFlowCLI.Exec;
            await exec.call(cli, commandName, args, flags);
        } else {
            cli.out.error(`Unknown command: ${commandName}`);
            cli.getCommand('help')?.exec.call(cli, 'help', []);
        }
    } else cli.start();
} catch (error: any) {
    fail(cli.out, error);
}

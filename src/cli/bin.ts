#!/usr/bin/env node
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Command-line entry point: parses arguments and dispatches the invoked command to the CLI.
 * @license Apache-2.0
 */
import Logger, { type Engine } from "@netfeez/vterm";

import DepflowCLI from "./DepflowCLI.js";
import Flags from "./Flags.js";

const skip = 2;
const [commandName, ...argsList] = process.argv.slice(skip);

/**
 * Reports a failure to the user and marks the process as failed.
 *
 * @remarks The failure is reported as one line through the logger, and not as a box painted with
 * literals: the box was a second implementation of the decoration of vterm, it disappeared with
 * `--decorate=false` while this one did not, and the summary it printed is not a per-command diagnostic,
 * so the policy never printed it and nothing was duplicated.
 *
 * @remarks The channel is the one of the console interface, which every mode leaves visible: a verdict
 * that fails while the screen says nothing at all is a verdict nobody can see, and the exit status is
 * the signal of a user who is not looking.
 *
 * @remarks The status is marked with `process.exitCode` and not forced with `process.exit`, and this is
 * the only way the evidence of a failing run reaches the `.vlog`: `vterm` feeds that file from a queue
 * it flushes without anyone awaiting it, and a forced exit kills the process while the complete buffer
 * of the commands is still in it. The status a user observes is the same one in both, because the run
 * is already over by the time this is called; what changes is whether the transcript survives it.
 *
 * @param out - The logger or engine the failure is reported to.
 * @param error - The failure, either an error or a message.
 * @returns void
 */
function fail(out: Engine | Logger, error: any): void {
    out.error(`&C1${error?.message || error}`);
    process.exitCode = 1;
}

// The command is resolved before the flags are parsed because the flags are declared per command: the
// global ones every command carries and the ones the invoked command owns. A command the map does not
// carry leaves nothing to parse and is answered by the console interface, help included, in every mode.
const cli = new DepflowCLI();
const command = commandName ? cli.getCommand(commandName) : undefined;

if (command) {
    let parsed: Flags.Result<DepflowCLI.Options> | undefined;
    try { parsed = new Flags(cli.declarationOf(commandName)).parse(argsList) as Flags.Result<DepflowCLI.Options>; }
    catch (error: any) { fail(cli.out, error); }

    // A failed parse leaves nothing to dispatch: the invocation was never understood, so there is no
    // argument to hand the command. The process still ends here, with the status `fail` marked.
    if (parsed !== undefined) {
        const { args, flags } = parsed;
        cli.configPath = flags.flow;

        try {
            const exec = command.exec as DepflowCLI.Exec;
            await exec.call(cli, commandName as string, args, flags);
        } catch (error: any) {
            fail(cli.out, error);
        }
    }
} else {
    cli.out.error(`Unknown command: ${commandName}`);
    cli.getCommand('help')?.exec.call(cli, 'help', []);
}

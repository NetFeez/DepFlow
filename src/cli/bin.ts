#!/usr/bin/env node
/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Command-line entry point: parses arguments and dispatches the invoked command to the CLI.
 * @license Apache-2.0
 */
import DepFlowCLI from "./DepFLowCLI.js";
import Flags from "./Flags.js";

const skip = 2;
const [commandName, ...argsList] = process.argv.slice(skip);

const { args, flags } = Flags.extractFlags(argsList);
const flowTag = flags['--flow'] || flags['-f'] || [];

const flowPath = flowTag[0] || 'depflow.json';

const cli = new DepFlowCLI(flowPath);

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
    cli.out.error(`&C(#FFB4DC)╭─────────────────────────────────────────────`);
    cli.out.error(`&C(#FFB4DC)│ &C1${error?.message || error}`);
    cli.out.error(`&C(#FFB4DC)╰─────────────────────────────────────────────`);
    process.exit(1)
}
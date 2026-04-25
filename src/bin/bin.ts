#!/usr/bin/env node

import DepFlowCLI from "./DepFLowCLI.js";

const cli = new DepFlowCLI();

try {
    const skip = 2;
    const [commandName, ...args] = process.argv.slice(skip);

    if (commandName) {
        const command = cli.getCommand(commandName);
        if (command) {
            await command.exec.call(cli, commandName, args);
        } else {
            cli.out.error(`Unknown command: ${commandName}`);
            cli.getCommand('help')?.exec.call(cli, 'help', []);
        }
    } else cli.start();
} catch (error: any) {
    cli.out.error(`&C(255,180,220)╭─────────────────────────────────────────────`);
    cli.out.error(`&C(255,180,220)│ &C1${error?.stack || error}`);
    cli.out.error(`&C(255,180,220)╰─────────────────────────────────────────────`);
    process.exit(1)
}
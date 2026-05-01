#!/usr/bin/env node

import DepFlowCLI from "./DepFLowCLI.js";
import { Utils } from "../support/Utils.js";
import Schemas from "../config/schemas.js";

function startupSchemaValidation(flowPath: string) {
    const jsonSchema = Schemas.Config.jsonSchema;
    Utils.addVscodeValidation(flowPath, jsonSchema);
}

const skip = 2;
const [commandName, ...args] = process.argv.slice(skip);

const flowTag = (
    Utils.getFlagValue(args, '--flow') ||
    Utils.getFlagValue(args, '-f')
);

const flowPath = flowTag[0] || 'depflow.json';
const cli = new DepFlowCLI(flowPath);

startupSchemaValidation(flowPath);
console.log(flowPath);
try {
    if (commandName !== null) {
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
#!/usr/bin/env node
import { File } from "@netfeez/common-node";

import DepFlowCLI from "./DepFLowCLI.js";
import { Utils } from "../support/Utils.js";
import schema from "../schema/schema.js";

async function startupSchemaValidation(flowPath: string) {
    const jsonSchema = schema.Config.jsonSchema;
    File.write(`.depflow/schema.json`, JSON.stringify(jsonSchema));
}

const skip = 2;
const [commandName, ...argsList] = process.argv.slice(skip);

const { args, flags } = Utils.extractFlags(argsList);
console.log(commandName, args, flags);
const flowTag = flags['--flow'] || flags['-f'] || [];

const flowPath = flowTag[0] || 'depflow.json';

const cli = new DepFlowCLI(flowPath);

await startupSchemaValidation(flowPath);

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
    cli.out.error(`&C(#FFB4DC)╭─────────────────────────────────────────────`);
    cli.out.error(`&C(#FFB4DC)│ &C1${error?.stack || error}`);
    cli.out.error(`&C(#FFB4DC)╰─────────────────────────────────────────────`);
    process.exit(1)
}
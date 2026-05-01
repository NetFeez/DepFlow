#!/usr/bin/env node
import { File } from "@netfeez/common-node";

import DepFlowCLI from "./DepFLowCLI.js";
import { Utils } from "../support/Utils.js";
import Schemas from "../config/schemas.js";

async function startupSchemaValidation(flowPath: string) {
    const jsonSchema = Schemas.Config.jsonSchema;
    // Temporarily write the schema to the .depflow directory for validation purposes
    // The vscode configuration was out for now, while ill enhance it we will use the $schema property in the depflow.json file to point to this schema
    File.write(`.depflow/schema.json`, JSON.stringify(jsonSchema));
    // Utils.addVscodeValidation(flowPath, jsonSchema);
}

const skip = 2;
const [commandName, ...args] = process.argv.slice(skip);

const flowTag = (
    Utils.getFlagValue(args, '--flow') ||
    Utils.getFlagValue(args, '-f')
);

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
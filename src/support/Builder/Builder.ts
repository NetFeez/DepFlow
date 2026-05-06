import type Logger from "@netfeez/vterm";
import { Async } from "@netfeez/common-node";

import type Schemas from "../../config/schemas.js";

import Utils from "../Utils.js";
import Task from "../Task/Task.js";
import { File, Path } from "@netfeez/common-node";

export class Builder {
    protected readonly pipeline: Builder.BuilderEntry[] = [];
    protected readonly cwd: string = process.cwd();
    protected readonly logger: Logger | null;

    public constructor(info: Builder.Info) {
        this.pipeline = info.pipeline;
        this.cwd = info.cwd;
        this.logger = info.logger || null;
    }
    
    public async run(): Promise<void> {
        this.logger?.group(Utils.newGroup('#00FFB4'));
        for (const step of this.pipeline) {
            let ranTask = false;
            if (step.run) try {
                const commands = typeof step.run === 'string' ? [ step.run ] : step.run;
                await this.runTask(commands, this.cwd, step.maxTimeMs ?? 60000);
            } catch (error) { this.logger?.error(`&C1[Run] &C7${error}`); }
            finally { ranTask = true; }
            if (step.extract) try {
                if (ranTask) this.logger?.line();
                await this.runExtractor(step.extract);
            } catch (error) { this.logger?.error(`&C1[Extract] &C7${error}`); }
        }
        this.logger?.groupEnd();
    }
    /**
     * Runs the extraction process based on the provided entry configuration, which can be either a string or an array of extraction entries.
     * It handles the copying of files from the specified source to the target location, applying any necessary path transformations based on the provided replacer configuration.
     * This method is essential for managing the file extraction phase of the build process, allowing for flexible and customizable file handling as defined in the builder configuration.
     * @param entry A string or an array of extraction entries that define the source, target, and optional path transformation for the extraction process.
     * @returns A promise that resolves when the extraction process is complete, or rejects with an error if any issues occur during the file copying or transformation.
     * @throws Will throw an error if any issues occur during the file copying process, such as problems with reading or writing files, or if the provided entry configuration is invalid.
     */
    protected async runExtractor(entry: string | Builder.Extractor[]): Promise<void> {
        const extractor = typeof entry === 'string' ? [ { from: '**/*', to: entry } ] : entry;

        for (const entry of extractor) {
            const { from, to: toEntry, replacer } = entry;

            const regex = !replacer ? null : new RegExp(typeof replacer === 'string' ? replacer : replacer.search, 'g');
            const value = !replacer || typeof replacer === 'string' ? '' : replacer.replace;

            const to = Path.isAbsolute(toEntry) ? toEntry : Path.join(Path.cwd, toEntry);
            this.logger?.log(`&C7Extracting &C3${from}&C7 to &C3${to}&C7...`);
            await File.smartCopy(from, to, {
                cwd: this.cwd,
                map: path => regex ? path.replace(regex, value) : path
            });
        }
    }
    /**
     * Runs a series of shell commands as part of the build process, using a child process to execute the commands and capturing the output for logging. It handles the execution of the commands, providing feedback on the progress and any errors that occur during the process. This method is essential for executing the necessary setup commands defined in the builder configuration, allowing for a flexible and dynamic build process that can accommodate various requirements for different dependencies.
     * @param commands An array of strings representing the shell commands to be executed as part of the build process.
     * @param logger An optional Logger instance for logging the output and errors from the command execution.
     * @returns A promise that resolves when the command execution is complete, or rejects with an error if any command fails, allowing callers to handle such scenarios appropriately.
     * @throws Will throw an error if any issues occur during the execution of the commands, such as problems with spawning the child process or if any command returns a non-zero exit code.
     */
    protected runTask(commands: string[], cwd: string, maxTimeMs: number): Promise<void> {
        return Async.awaitEvent<void>((done, fail) => {
            const pollito = new Task(cwd, commands);
            if (this.logger) {
                pollito.on('line', (line) => this.logger?.info(`${line}`));
                pollito.on('error', (msg, step) => this.logger?.error(`&C1[Step ${step}]&C7: &C1${msg}`));
            }
            pollito.once('finish', (data) => {
                if (data.fails > 0) fail(new Error(`Build failed with ${data.fails} failed steps.`));
                else done();
            });
            pollito.start().catch(fail);
            return () => { pollito.stop(); };
        }, maxTimeMs);
    }
}
export namespace Builder {
    export type BuilderEntry = Schemas.BuilderEntry['infer'];
    export type Extractor = Schemas.ExtractorEntry['infer'];
    export interface Info {
        pipeline: BuilderEntry[];
        cwd: string;
        logger?: Logger | null;
    }
}
export default Builder;
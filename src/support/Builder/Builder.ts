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
            if ('run' in step && step.run) {
                const commands = typeof step.run === 'string' ? [ step.run ] : step.run;
                await this.runTask(commands, this.cwd, step.maxTimeMs ?? 60000);
            }
            if ('extract' in step && step.extract) {
                await this.runExtractor(step.extract);
            }
            if ( 'transform' in step && step.transform) {
                await this.runGlobalTransform(step.transform);
            }
        }
        this.logger?.groupEnd();
    }
    protected async runGlobalTransform(options: Schemas.GlobalTransform['infer']): Promise<void> {
        this.logger?.log(`&C7Applying global transformation in &C3${this.cwd}&C7...`);
        const transformAction = Builder.replacer(options);
        const glob = options.glob;

        await File.smartProcess('glob', this.cwd, {
            cwd: this.cwd,
        }, async ({ src, dest }) => {
            const content = await File.read(src);
            const transformedContent = transformAction(content);
            await File.write(dest, transformedContent);
        });
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
            const { from, to: toEntry, pathReplacer, transform } = entry;

            const pathReplacerAction = Builder.replacer(pathReplacer);
            const replacerAction = Builder.replacer(transform);

            const to = Path.isAbsolute(toEntry) ? toEntry : Path.join(Path.cwd, toEntry);
            this.logger?.log(`&C7Extracting &C3${from}&C7 to &C3${to}&C7...`);
            
            await File.smartProcess(from, to, {
                cwd: this.cwd,
                map: pathReplacerAction,
            }, async ({ src, dest }) => {
                const content = await File.read(src);
                const transformedContent = replacerAction(content);
                await File.write(dest, transformedContent);
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
    /**
     * Creates a string replacement function based on the provided replacer configuration, which can be either a simple string or an object defining a search pattern and replacement string. This method is used to generate a function that can be applied to strings for dynamic transformations during the build process, allowing for flexible and customizable string manipulation as defined in the builder configuration.
     * @param replacer A configuration for string replacement, which can be either a string (used as a regex pattern) or an object containing a search pattern and a replacement string.
     * @returns A function that takes a string as input and returns a new string with the specified replacements applied, based on the provided replacer configuration.
     * @throws Will throw an error if the provided replacer configuration is invalid, such as if it is neither a string nor an object with the required properties.
     */
    protected static replacer(replacer: Schemas.Transform['infer']): Builder.ReplacerAction {
        if (typeof replacer === 'string') {
            return (str) => str.replace(new RegExp(replacer, 'g'), '');
        } else if (replacer !== null && typeof replacer === 'object') {
            const flags = replacer.flags || 'g';
            const search = new RegExp(replacer.search, flags);
            const replace = replacer.replace || '';
            return (str) => str.replace(search, replace);
        } else return (str) => str;
    }
}
export namespace Builder {
    export type Replacer = Schemas.Transform['infer'];
    export type ReplacerAction = (str: string) => string;
    export type BuilderEntry = Schemas.BuilderEntry['infer'];
    export type Extractor = Schemas.ExtractorEntry['infer'];
    export interface Info {
        pipeline: BuilderEntry[];
        cwd: string;
        logger?: Logger | null;
    }
}
export default Builder;
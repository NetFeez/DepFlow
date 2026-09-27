/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Runs dependency build pipelines: shell commands, file extraction and content transformations.
 * @license Apache-2.0
 */
import { File, Path } from "@netfeez/common-node";
import type Logger from "@netfeez/vterm";

import Task from "../task/Task.js";
import Group from "../task/Group.js";
import schema from "../schema/schema.js";

export class Builder {
    protected readonly pipeline: schema.Builder = [];
    protected readonly cwd: string = process.cwd();
    protected readonly projectRoot: string = process.cwd();
    protected readonly logger: Logger | null;

    public constructor(info: Builder.Info) {
        this.pipeline = info.pipeline;
        this.cwd = info.cwd;
        this.projectRoot = info.projectRoot;
        this.logger = info.logger || null;
    }
    public async run(): Promise<void> {
        this.logger?.group(Group.create('#00FFB4'));
        
        for (const step of this.pipeline) {
            if ('run' in step && step.run) {
                const commands = typeof step.run === 'string' ? [ step.run ] : step.run;
                await this.runTask(commands, this.cwd, { maxTimeMs: step.maxTimeMs, allowFails: step.allowFails });
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
    protected async runGlobalTransform(options: schema.GlobalTransform): Promise<void> {
        this.logger?.log(`&C7Applying global transformation in &C3${this.cwd}&C7...`);
        const transformAction = Builder.replacer(options);
        const glob = options.glob;

        await File.smartProcess(glob, this.cwd, {
            cwd: this.cwd,
        }, async ({ src, dest }) => {
            const content = await File.read(src);
            const transformedContent = transformAction(content);
            await File.write(dest, transformedContent);
        });
    }
    /**
     * Resolves the destination folder of an extraction entry, which is relative to the project root, and
     * guarantees it stays inside it.
     * @param to - The destination folder declared by the entry.
     * @returns The normalized path of the destination folder.
     * @throws { Error } When a relative destination escapes the project root.
     *
     * @remarks An absolute destination is taken as it stands: writing outside the project is a decision
     * the configuration takes on purpose, and spelling it out as an absolute path is what makes it one.
     * A relative destination cannot, because a `..` that walks out of the project is a mistake and not a
     * decision. The project root is a destination like any other, so it is not treated as an escape.
     */
    protected resolveDestination(to: string): string {
        if (Path.isAbsolute(to)) return to;

        const root = Path.normalize(this.projectRoot);
        const destination = Path.normalize(Path.join(root, to));
        if (destination !== root && !Path.isInside(root, destination)) throw new Error(`Extraction destination resolves outside of the project root: ${destination}`);
        return destination;
    }
    /**
     * Runs the extraction process based on the provided entry configuration, which can be either a string or an array of extraction entries.
     * It handles the copying of files from the specified source to the target location, applying any necessary path transformations based on the provided replacer configuration.
     * This method is essential for managing the file extraction phase of the build process, allowing for flexible and customizable file handling as defined in the builder configuration.
     * @param entry - A string or an array of extraction entries that define the source, target, and optional path transformation for the extraction process.
     * @returns A promise that resolves when the extraction process is complete, or rejects with an error if any issues occur during the file copying or transformation.
     * @throws Will throw an error if any issues occur during the file copying process, such as problems with reading or writing files, or if the provided entry configuration is invalid.
     */
    protected async runExtractor(entry: string | schema.Extractor): Promise<void> {
        const extractor: schema.Extractor = typeof entry === 'string'
            ? { '**/*': { to: entry } }
            : entry;

        for (const [from, entry] of Object.entries(extractor)) {
            const { to, map, transform } = typeof entry === 'string' ? { to: entry } : entry;

            const mapper = Builder.replacer(map);
            const replacer = Builder.replacer(transform);

            const destination = this.resolveDestination(to);
            this.logger?.log(`&C7Extracting &C3${from}&C7 to &C3${to}&C7...`);
            
            await File.smartProcess(from, destination, {
                cwd: this.cwd,
                map: mapper,
            }, async ({ src, dest }) => {
                const content = await File.read(src);
                const transformedContent = replacer(content);
                await File.write(dest, transformedContent);
            });
        }
    }
    /**
     * Runs the shell commands of a build step as a Task, reporting their output as it comes.
     * The verdict of the task is the verdict of the step: it is awaited, never read from an event.
     * @param commands - The shell commands to run, in order.
     * @param cwd - The working directory the commands run in.
     * @param options - The options of the step: its deadline and whether its failures are tolerated.
     * @returns A promise resolving once the commands ran, or rejecting when the step fails.
     * @throws { Task.Failure } When the step fails and does not tolerate failures.
     */
    protected async runTask(commands: string[], cwd: string, options: Task.Options): Promise<void> {
        const task = new Task(cwd, commands, options);
        if (this.logger) {
            task.on('line', (line) => this.logger?.info(`${line}`));
            task.on('err', (line) => this.logger?.error(`${line}`));
            task.on('error', (msg, step) => this.logger?.error(`&C1[Step ${step}]&C7: &C1${msg}`));
        }
        await task.run();
    }
    /**
     * Creates a string replacement function based on the provided replacer configuration, which can be either a simple string or an object defining a search pattern and replacement string. This method is used to generate a function that can be applied to strings for dynamic transformations during the build process, allowing for flexible and customizable string manipulation as defined in the builder configuration.
     * @param replacer - A configuration for string replacement, which can be either a string (used as a regex pattern) or an object containing a search pattern and a replacement string.
     * @returns A function that takes a string as input and returns a new string with the specified replacements applied, based on the provided replacer configuration.
     * @throws Will throw an error if the provided replacer configuration is invalid, such as if it is neither a string nor an object with the required properties.
     */
    protected static replacer(replacer?: schema.Transform): Builder.Transformer {
        if (typeof replacer === 'string') {
            const search = new RegExp(replacer, 'g');
            return (str) => str.replace(search, '');
        } else if (replacer !== null && typeof replacer === 'object') {
            const flags = replacer.flags || 'g';
            const search = new RegExp(replacer.search, flags);
            const replace = replacer.replace || '';
            return (str) => str.replace(search, replace);
        } else return (str) => str;
    }
}
export namespace Builder {
    export type Transformer = (str: string) => string;
    export interface Info {
        pipeline: schema.Builder;
        /**
         * The folder the pipeline reads and works in: the checkout of a dependency, or the project itself
         * for a `dep run` action. It is the base of every glob, of every `run` step and of every `map`.
         */
        cwd: string;
        /**
         * The root of the project the pipeline deposits into. It is the base of every relative `to` of an
         * extraction step, which is where the artifacts of a dependency are meant to land.
         */
        projectRoot: string;
        logger?: Logger | null;
    }
}
export default Builder;
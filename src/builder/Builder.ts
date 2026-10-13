/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Runs dependency build pipelines: shell commands, file extraction and content transformations.
 * @license Apache-2.0
 */
import { File, Path } from "@netfeez/common-node";
import type Logger from "@netfeez/vterm";

import Task from "../task/Task.js";
import Group from "../task/Group.js";
import OutputPolicy from "../task/OutputPolicy.js";
import schema from "../schema/schema.js";

export class Builder {
    protected readonly pipeline: schema.Builder;
    protected readonly cwd: string;
    protected readonly projectRoot: string;
    protected readonly logger: Logger | null;
    protected readonly policy: OutputPolicy | null;

    /** The step that stopped the pipeline, or `null` while it is still walking it. */
    protected vStopped: Builder.Stopped | null = null;

    public constructor(info: Builder.Info) {
        this.pipeline = info.pipeline;
        this.cwd = info.cwd;
        this.projectRoot = info.projectRoot;
        this.logger = info.logger || null;
        this.policy = info.policy || null;
    }

    /**
     * Runs the pipeline and reports what every step of it did.
     * @returns A promise resolving with the report of the run, or rejecting with a
     * {@link Builder.Failure} carrying that same report, when a step stopped the pipeline.
     *
     * @remarks The report is the verdict of the run, and it is produced whether the run succeeded or
     * failed: a caller that catches a {@link Builder.Failure} gets the steps that ran before the one
     * that stopped it, and the steps that never ran at all, so nothing about the pipeline is missing
     * from a failure.
     *
     * @remarks The group of the run is closed in a `finally`, so the steps of a pipeline that threw leave
     * the output as closed as the ones of a pipeline that finished. It is opened only when the run
     * decorates its output, because a group that draws nothing still leaves a box and an indentation
     * around every line written inside it.
     */
    public async run(): Promise<Builder.Report> {
        const boxed = this.policy === null || this.policy.decoration === 'on';
        if (boxed) this.logger?.group(Group.create('#00FFB4'));

        try {
            const steps = await this.walk();
            const report = Builder.report(steps);
            this.policy?.settleBuild(report);
            if (!report.ok) throw new Builder.Failure(report, Builder.reason(report));
            return report;
        } finally {
            if (boxed) this.logger?.end();
        }
    }

    /**
     * Walks the pipeline in order, running each step until one of them stops it.
     * @returns A promise resolving with one report per step of the pipeline, the ones that ran and the
     * ones the stop left behind.
     */
    protected async walk(): Promise<Builder.StepReport[]> {
        const steps: Builder.StepReport[] = [];

        for (const [ position, entry ] of this.pipeline.entries()) {
            const index = position + 1;
            if (this.vStopped) steps.push(Builder.pending(index, Builder.kind(entry)));
            else steps.push(await this.runStep(index, entry));
        }

        return steps;
    }

    /**
     * Runs one step of the pipeline and turns it into its report.
     * @param index - The position of the step inside the pipeline, starting at 1.
     * @param entry - The entry of the pipeline describing the step.
     * @returns A promise resolving with the report of the step.
     *
     * @remarks An entry that carries no step at all is reported as one that did not run, the way the
     * pipeline has always walked over it, and the report accounts for it all the same.
     */
    protected async runStep(index: number, entry: schema.BuilderEntry): Promise<Builder.StepReport> {
        if ('run' in entry && entry.run) return this.runRun(index, entry);
        if ('extract' in entry && entry.extract) await this.runExtractor(entry.extract);
        else if ('transform' in entry && entry.transform) await this.runGlobalTransform(entry.transform);
        else return Builder.pending(index, null);

        return Builder.settled(index, 'extract' in entry ? 'extract' : 'transform');
    }

    /**
     * Runs the commands of a `run` step as a Task, settling the step with the verdict of the task.
     * @param index - The position of the step inside the pipeline, starting at 1.
     * @param entry - The `run` entry describing the step.
     * @returns A promise resolving with the report of the step.
     *
     * @remarks A step that does not tolerate its failures stops the pipeline, so the steps after it are
     * reported as steps that never ran. The step itself is not rethrown from here: the report of the run
     * is the verdict of the pipeline, and rejecting twice would report the same failure twice.
     */
    protected async runRun(index: number, entry: schema.RunEntry): Promise<Builder.StepReport> {
        const commands = typeof entry.run === 'string' ? [ entry.run ] : entry.run;
        const identity = Builder.identity(index, this.steps);

        try {
            const outcome = await this.runTask(commands, this.cwd, { maxTimeMs: entry.maxTimeMs, allowFails: entry.allowFails }, identity);
            return {
                index,
                kind: 'run',
                ran: true,
                success: outcome.success,
                failed: outcome.fails,
                tolerated: entry.allowFails === true && outcome.fails > 0,
                reason: null,
                commands: outcome.results.map(Builder.commandReport)
            };
        } catch (failure) {
            const outcome = failure instanceof Task.Failure ? failure.outcome : null;
            this.vStopped = { index, reason: failure instanceof Task.Failure ? failure.reason : 'step' };
            if (failure instanceof Task.Failure) this.policy?.stepFailed(identity, failure);

            return {
                index,
                kind: 'run',
                ran: true,
                success: false,
                failed: outcome?.fails ?? 0,
                tolerated: false,
                reason: this.vStopped.reason,
                commands: (outcome?.results ?? []).map(Builder.commandReport)
            };
        }
    }

    /**
     * How many steps of the pipeline run commands, the number a command identity is qualified by.
     * @returns The amount of `run` entries in the pipeline.
     */
    protected get steps(): number {
        return this.pipeline.filter(entry => Builder.kind(entry) === 'run').length;
    }

    /**
     * Runs the shell commands of a build step as a Task, reporting them through the policy of the run.
     * The verdict of the task is the verdict of the step: it is awaited, never read from an event.
     * @param commands - The shell commands to run, in order.
     * @param cwd - The working directory the commands run in.
     * @param options - The options of the step: its deadline and whether its failures are tolerated.
     * @param identity - The identity the commands of this task are reported under.
     * @returns A promise resolving with the summary of the run of the task.
     * @throws { Task.Failure } When the step fails and does not tolerate failures.
     */
    protected async runTask(commands: string[], cwd: string, options: Task.Options, identity: OutputPolicy.Identity): Promise<Task.FinishData> {
        const task = new Task(cwd, commands, options);

        if (this.policy) {
            task.on('line', (line, ordinal) => this.policy?.live(identity, line, ordinal, 'stdout'));
            task.on('err', (line, ordinal) => this.policy?.live(identity, line, ordinal, 'stderr'));
            task.once('finish', (data) => this.policy?.settleTask(identity, data));
        } else if (this.logger) {
            task.on('line', (line) => this.logger?.info(`${line}`));
            task.on('err', (line) => this.logger?.error(`${line}`));
        }

        return task.run();
    }

    /**
     * Applies a global transformation to every file of the working directory, the one the configuration
     * asks for through its glob.
     * @param options - The transformation to apply, either as a search and replace pair or as a plain
     * regular expression.
     * @returns A promise resolving when every file of the glob has been transformed.
     */
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
     * Creates a string replacement function based on the provided replacer configuration, which can be either a simple string or an object defining a search pattern and replacement string. This method is used to generate a function that can be applied to strings for dynamic transformations during the build process, allowing for flexible and customizable string manipulation as defined in the builder configuration.
     * @param replacer - A configuration for string replacement, which can be either a string (used as a regex pattern) or an object containing a search pattern and replacement string.
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

    /**
     * The kind of step an entry of the pipeline describes, decided by the key it carries.
     * @param entry - The entry of the pipeline.
     * @returns The kind of the step, or `null` when the entry describes no step at all.
     */
    protected static kind(entry: schema.BuilderEntry): Builder.Kind | null {
        if ('run' in entry && entry.run) return 'run';
        if ('extract' in entry && entry.extract) return 'extract';
        if ('transform' in entry && entry.transform) return 'transform';
        return null;
    }

    /**
     * The identity the commands of a `run` step are reported under.
     *
     * @remarks A command is identified as `C<M>` inside its own task, and as `S<N> · C<M>` when the
     * pipeline runs more than one of them: with a single `run` step there is nothing to qualify it
     * against, and with more than one there is, so `C1` alone would name two different commands.
     *
     * @param index - The position of the step inside the pipeline, starting at 1.
     * @param steps - How many `run` steps the pipeline has.
     * @returns The identity of the commands of the step.
     */
    protected static identity(index: number, steps: number): OutputPolicy.Identity {
        return { step: steps > 1 ? index : null };
    }

    /**
     * The report of a command inside a step: who it was and how it ended, without what it printed.
     *
     * @remarks The output of a command is not part of the report: a report says what the pipeline did,
     * and a build that printed a log would carry that log in every summary it produced, in every layer
     * that received it. The output stays where it was produced, in the results of the task, and it is
     * read once, when the task settles.
     *
     * @param result - The result of the command.
     * @returns The report of the command.
     */
    protected static commandReport(result: Task.commandResult): Builder.CommandReport {
        return {
            ordinal: result.ordinal,
            label: result.label,
            success: result.success,
            code: result.code,
            signal: result.signal,
            reason: result.reason,
            time: result.time
        };
    }

    /**
     * The report of a step that ran and had nothing to report beyond having run.
     * @param index - The position of the step inside the pipeline, starting at 1.
     * @param kind - The kind of the step, which a step that only works on files never has.
     * @returns The report of the step.
     */
    protected static settled(index: number, kind: Builder.Kind): Builder.StepReport {
        return { index, kind, ran: true, success: true, failed: 0, tolerated: false, reason: null, commands: [] };
    }

    /**
     * The report of a step that never ran, either because an earlier one stopped the pipeline or because
     * the entry describes no step at all.
     * @param index - The position of the step inside the pipeline, starting at 1.
     * @param kind - The kind of the step, `null` when the entry describes none.
     * @returns The report of the step that did not run.
     */
    protected static pending(index: number, kind: Builder.Kind | null): Builder.StepReport {
        return { index, kind, ran: false, success: false, failed: 0, tolerated: false, reason: null, commands: [] };
    }

    /**
     * The report of a whole pipeline.
     * @param steps - One report per step of the pipeline, in order.
     * @returns The report of the run.
     */
    protected static report(steps: Builder.StepReport[]): Builder.Report {
        const ran = steps.filter(step => step.ran);

        return {
            ok: ran.length === steps.length && ran.every(step => step.success),
            commands: ran.reduce((total, step) => total + step.commands.length, 0),
            failed: ran.reduce((total, step) => total + step.failed, 0),
            tolerated: ran.filter(step => step.tolerated).reduce((total, step) => total + step.failed, 0),
            steps
        };
    }

    /**
     * Why the pipeline stopped, read from the step that stopped it: the reason the step could not
     * complete, or the commands that failed and it did not tolerate.
     * @param report - The report of the run.
     * @returns The reason the run did not finish successfully.
     */
    protected static reason(report: Builder.Report): Builder.Reason {
        const step = report.steps.find(entry => entry.ran && !entry.success);
        if (!step) return 'step';
        if (step.reason !== null) return step.reason;
        return step.failed > 0 ? 'command' : 'step';
    }
}
export namespace Builder {
    export type Transformer = (str: string) => string;
    export type Kind = 'run' | 'extract' | 'transform';
    export type Entry = schema.RunEntry | schema.ExtractEntry | schema.TransformEntry;
    export type Reason = Task.Reason | 'command' | 'step';

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
        /**
         * The policy the output of the commands of the pipeline is reported through. Without it the
         * builder falls back to the logger it was given, which streams the live output and says nothing
         * else about it.
         */
        policy?: OutputPolicy | null;
    }

    /** What one command of a `run` step did, without what it printed. */
    export interface CommandReport {
        /** The position of the command inside its step, starting at 1. */
        ordinal: number;
        /** The human readable form of the command, whole, as it was given. */
        label: string;
        /** Whether the command ended as it was asked to. */
        success: boolean;
        /** The exit status, or `null` when there was none. */
        code: number | null;
        /** The signal that took the command down, or `null` when there was none. */
        signal: NodeJS.Signals | null;
        /** Why there is no status at all, or `null` when the command reported one. */
        reason: Task.Reason | null;
        /** The time the command took, in milliseconds. */
        time: number;
    }

    /**
     * What one step of the pipeline did.
     *
     * @remarks The kind of a step is `null` only for an entry that describes no step at all, which the
     * pipeline walks over: the report accounts for every entry of the pipeline, and an entry that runs
     * nothing has no kind to account for it with.
     */
    export interface StepReport {
        /** The position of the step inside the pipeline, starting at 1. */
        index: number;
        /** The kind of the step, `null` when the entry describes none. */
        kind: Kind | null;
        /** Whether the step ran, `false` for the steps an earlier failure left behind. */
        ran: boolean;
        /** Whether the step ended as it was asked to. */
        success: boolean;
        /** How many commands of the step failed. */
        failed: number;
        /** Whether the step tolerated the failures it had, so the pipeline kept going. */
        tolerated: boolean;
        /** Why the step could not complete, or `null` when it completed. */
        reason: Reason | null;
        /** One report per command of a `run` step, empty for every other kind. */
        commands: CommandReport[];
    }

    /** What a whole pipeline did. */
    export interface Report {
        /** Whether every step of the pipeline ran and succeeded. */
        ok: boolean;
        /** How many commands ran, across every step. */
        commands: number;
        /** How many of them failed. */
        failed: number;
        /** How many of those failures a step tolerated, so the pipeline kept going. */
        tolerated: number;
        /** One report per step of the pipeline, in order, the ones that ran and the ones that did not. */
        steps: StepReport[];
    }

    /** Why the pipeline stopped, and at which step, kept while the remaining steps are still being reported. */
    export interface Stopped {
        index: number;
        reason: Reason;
    }

    /**
     * The failure of a pipeline, carrying the report of the run that produced it.
     *
     * @remarks The report is the same one the run would have resolved with, so a caller that only wants
     * to know how the pipeline went catches this and reads it instead of rebuilding it from the steps
     * that did run.
     */
    export class Failure extends Error {
        /**
         * Creates the failure of a pipeline.
         * @param report - The report of the run.
         * @param reason - Why the pipeline stopped.
         */
        public constructor(public readonly report: Report, public readonly reason: Reason = 'step') {
            super(Failure.message(report, reason));
            this.name = 'Builder.Failure';
        }

        /**
         * The message describing which step stopped the pipeline and why, in one line.
         * @param report - The report of the run.
         * @param reason - Why the pipeline stopped.
         * @returns The message of the failure.
         */
        private static message(report: Report, reason: Reason): string {
            const step = report.steps.find(entry => entry.ran && !entry.success);
            const where = step ? `Step ${step.index}` : 'The pipeline';
            const because = reason === 'command' ? `${report.failed} failed command(s)`
                : reason === 'step' ? 'a step of it failed' : reason;
            return `${where} stopped the pipeline: ${because}.`;
        }
    }
}
export default Builder;

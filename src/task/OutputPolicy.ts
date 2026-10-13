/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Decides how the output of the commands a run executes is presented: how much of it reaches
 *              the screen, which command every line belongs to, and what is kept as evidence.
 * @license Apache-2.0
 */
import Logger, { type Renderer } from "@netfeez/vterm";

import type Task from "./Task.js";
import type Builder from "../builder/Builder.js";

export class OutputPolicy {
    /** The width a label is read at before it is closed with an ellipsis. */
    public static readonly LABEL_LENGTH: number = 40;

    public readonly report: Logger;

    /** The channel the failures of a silent run are reported through, free of the boxes of the run. */
    protected readonly direct: Logger;
    protected readonly evidence: Logger;

    protected readonly vVerbosity: OutputPolicy.Verbosity;
    protected readonly vDecoration: OutputPolicy.Decoration;

    /** The command the stream being shown belongs to, so a new one is announced once and not once per line. */
    protected vAnnounced: string | null = null;

    /**
     * Builds the policy of a run out of the logger its evidence is kept in and the mode it asked to be
     * run in.
     * @param info - The logger the evidence of the run is kept in, and the mode the run asked to be run in.
     *
     * @remarks The policy is the single owner of the mode, so it settles the channel the lifecycle of the
     * run is reported through: a run that is not silent reports its lifecycle through the boxed report,
     * and a silent run silences that channel and says the failures through the direct one, which is what
     * makes the silence a mode instead of a decision each of the emitters of that lifecycle would have to
     * know about.
     *
     * @remarks The three channels are compositions of their own, and they all attach to the file transport
     * of the logger they are built on, so a run writes one evidence file however many of them end up
     * saving: the evidence of a command and the report of the run belong to the same account of the same
     * run.
     */
    public constructor(info: OutputPolicy.Info) {
        this.vVerbosity = OutputPolicy.verbosity(info);
        this.vDecoration = info.decorate ? 'on' : 'off';

        this.report = new Logger({
            name: info.name,
            show: this.vVerbosity !== 'silent',
            renderer: OutputPolicy.compose(this.vDecoration)
        });

        this.direct = new Logger({
            name: info.name,
            show: true,
            renderer: OutputPolicy.compose(this.vDecoration)
        });

        this.evidence = new Logger({
            name: info.name,
            show: false,
            renderer: OutputPolicy.plain()
        });

        info.logger.file?.attach(this.report.engine);
        info.logger.file?.attach(this.direct.engine);
        info.logger.file?.attach(this.evidence.engine);
    }

    /** How much of the output of the commands is shown. **/
    public get verbosity(): OutputPolicy.Verbosity { return this.vVerbosity; }
    /** Whether the output is drawn inside boxes, with timestamps, levels and names. **/
    public get decoration(): OutputPolicy.Decoration { return this.vDecoration; }

    /**
     * The channel the lifecycle of the run is reported through: the boxed report of the run, or the
     * direct channel when the run is silent, so a silence says the failures and nothing of the boxes.
     * @returns The channel to write the lifecycle to.
     */
    protected shown(): Logger {
        return this.vVerbosity === 'silent' ? this.direct : this.report;
    }

    /**
     * Reports a line a command that is still running just wrote.
     * @param identity - The step the commands of the task run in.
     * @param line - The line the command wrote.
     * @param ordinal - The position of the command inside its task, starting at 1.
     * @param channel - The stream the line came from.
     * @returns void
     *
     * @remarks Only a verbose run shows the stream of a command as it comes; the other two modes report
     * the commands once they are done, read from the verdict of the task rather than from this stream,
     * which is a projection of the output and not a transcript of it. Each line of the stream is trimmed
     * of the whitespace around it, the inheritance of a projection that reads a line instead of
     * reproducing the buffer it was written in.
     */
    public live(identity: OutputPolicy.Identity, line: string, ordinal: number, channel: OutputPolicy.Channel): void {
        if (this.vVerbosity !== 'verbose') return;

        this.announce(identity, ordinal);
        if (channel === 'stdout') this.shown().info(line.trim());
        else this.shown().error(line.trim());
    }

    /**
     * Reports the commands of a task that is done: one result line per command and the failure of the ones
     * that failed.
     * @param identity - The step the commands of the task ran in.
     * @param data - The summary of the run of the task.
     * @returns void
     *
     * @remarks This is the only moment the output of the commands is consumed. The complete buffer of
     * every command reaches the evidence file before its result is rendered, and neither the report of a
     * build nor the summary of a task carries it past this point, so a command that is not reported here
     * is a command whose output is nowhere.
     */
    public settleTask(identity: OutputPolicy.Identity, data: Task.FinishData): void {
        data.results.forEach(result => this.settle(identity, result));
        this.vAnnounced = null;
    }

    /**
     * Reports a task that stopped, marking the step it belongs to as failed.
     * @param identity - The step the task ran in, when it ran inside a pipeline.
     * @param failure - The failure the task rejected with.
     * @returns void
     *
     * @remarks What is marked here is the step and not its commands: every command of the task was already
     * reported when the task settled, and the summary of the failure belongs to whoever catches it, which
     * is the only place that can decide what the exit status of the process is going to be.
     */
    public stepFailed(identity: OutputPolicy.Identity, failure: Task.Failure): void {
        const where = identity.step === null ? 'step' : `S${identity.step} · step`;
        const marker = failure.reason === 'command' ? '&C1✘' : '&C3⊘';
        this.shown().error(`${marker} ${where} failed`);
    }

    /**
     * Reports a pipeline that is done, marking the steps that tolerated the failures they had.
     * @param report - The report of the run of the pipeline.
     * @returns void
     *
     * @remarks A tolerated failure is a fact about a step and not about a command, and it is said here
     * because the report is where a step accounts for it. A command that failed under `allowFails` is
     * never marked as completed, and a step that let it through is never reported as a success either:
     * the two facts are both true and neither of them is told by the other.
     *
     * @remarks The verdict of the pipeline itself is not reported here. It belongs to whoever catches the
     * failure of the run, so that a mode can never turn a failing build into a successful one.
     */
    public settleBuild(report: Builder.Report): void {
        report.steps.forEach((step) => {
            if (!step.tolerated) return;
            this.shown().warn(`&C3⚠ S${step.index} tolerated ${step.failed} ${step.failed === 1 ? 'failure' : 'failures'}`);
        });
    }

    /**
     * Reports one command of a task that is done: what it captured, what it ended as, and what it printed.
     * @param identity - The step the command ran in.
     * @param result - The result of the command.
     * @returns void
     *
     * @remarks A failure is never left with its marker alone in a mode that shows something: the
     * diagnostic is what says what went wrong, and it is said once, as a line of its own, whether the
     * command ended with a status or never had one to report.
     *
     * @remarks The complete buffer is the only thing a verbose run does not repeat, because that run has
     * already shown it as it came. What the two modes share is the diagnostic, and what separates them
     * is the buffer: neither of them shows it twice.
     */
    protected settle(identity: OutputPolicy.Identity, result: Task.commandResult): void {
        this.evident(identity, result);
        const who = OutputPolicy.identity(identity, result.ordinal);
        const out = this.shown();

        if (this.vVerbosity === 'silent') {
            if (!result.success) out.error(OutputPolicy.terse(who, result));
            return;
        }

        if (result.success) {
            out.info(OutputPolicy.completed(who));
            return;
        }

        out.error(OutputPolicy.verdict(who, result));
        if (result.reason !== null || this.vVerbosity === 'verbose') {
            out.error(result.diagnostic);
            return;
        }

        this.block(result, out);
    }

    /**
     * Renders the failure of a command: what it was, how it ended, and everything it printed.
     * @param result - The result of the command, which has a status of its own to report.
     * @returns void
     *
     * @remarks The buffer of a command that never had a status is not rendered here: its capture is
     * incomplete by definition, because the process it was capturing never ended, and presenting an
     * incomplete capture as the evidence of a failure is a claim the data does not carry.
     *
     * @remarks The diagnostic is enough on its own for that case, because it already carries the label:
     * the thinned label is not repeated above a line that says the same thing in full.
     */
    protected block(result: Task.commandResult, out: Logger = this.shown()): void {
        out.error(OutputPolicy.label(result.label));
        out.error(result.diagnostic);
        this.captured(out, 'error', 'stdout', result.stdout, false);
        this.captured(out, 'error', 'stderr', result.stderr, false);
    }

    /**
     * Writes everything a command captured into the evidence file, whether it is shown or not.
     * @param identity - The step the command ran in.
     * @param result - The result of the command.
     * @returns void
     *
     * @remarks The evidence carries the complete buffer of every command in every mode, tagged with the
     * identity of the command and labelled by channel, and a buffer of a process that never ended says so
     * because an incomplete capture presented as a whole one is a lie about what the command said.
     */
    protected evident(identity: OutputPolicy.Identity, result: Task.commandResult): void {
        const incomplete = result.reason !== null;

        this.evidence.info(`[${OutputPolicy.identity(identity, result.ordinal)}] ${result.label}`);
        if (result.diagnostic !== '') this.evidence.info(result.diagnostic);
        this.captured(this.evidence, 'info', 'stdout', result.stdout, incomplete);
        this.captured(this.evidence, 'info', 'stderr', result.stderr, incomplete);
    }

    /**
     * Writes one captured channel of a command into a channel of the policy, labelled and line by line.
     * @param logger - The channel the capture is written to.
     * @param level - The level the capture is written at.
     * @param channel - The stream the capture came from.
     * @param content - Everything the stream accumulated.
     * @param incomplete - Whether the capture stopped because the process never ended.
     * @returns void
     *
     * @remarks An empty channel is not labelled: a label over nothing is noise, and a reader who sees no
     * label knows there was nothing there. Each line is a call of its own, so the wrapping of a line
     * longer than the render width applies to it alone and never to the whole capture.
     */
    protected captured(logger: Logger, level: OutputPolicy.Level, channel: OutputPolicy.Channel, content: string, incomplete: boolean): void {
        if (content === '') return;

        logger[level](`${channel}:${incomplete ? ' (incomplete)' : ''}`);
        content.split(/\r?\n/).forEach(line => logger[level](line));
    }

    /**
     * Announces the command the stream now belongs to, once per command and not once per line.
     * @param identity - The step the command runs in.
     * @param ordinal - The position of the command inside its task, starting at 1.
     * @returns void
     */
    protected announce(identity: OutputPolicy.Identity, ordinal: number): void {
        const who = OutputPolicy.identity(identity, ordinal);
        if (this.vAnnounced === who) return;

        this.vAnnounced = who;
        this.shown().info(`&C7[${who}]`);
    }

    /**
     * The mode a run asked for out of the two flags that can conflict, where a silence wins over an addition.
     * @param info - What the run asked for.
     * @returns The mode of the run.
     *
     * @remarks The precedence lives here and not in the parser on purpose: a combination of flags is a
     * thing a user types, not a thing a parser has an opinion about, and a mode that a parser rejected
     * would leave a user with no way to say what they meant.
     */
    protected static verbosity(info: OutputPolicy.Info): OutputPolicy.Verbosity {
        if (info.silent) return 'silent';
        if (info.verbose) return 'verbose';
        return 'default';
    }

    /**
     * The renderer of the channels that are shown: a decorated line paints its head and its rails inside
     * the width of the line, and an undecorated one wraps its content in the whole width.
     * @param decoration - Whether the run decorates its output.
     * @returns The renderer of the shown channels.
     *
     * @remarks The renderer asks the width of the terminal of the run through the columns callback the
     * logger was built with, so a line never reaches further than the terminal that reads it, and the
     * decoration lives inside that width instead of widening the line. That is why a decorated line wraps
     * its content earlier than an undecorated one does, and why turning the decoration off changes what is
     * drawn around the content and never reaches wider than the same terminal either.
     */
    protected static compose(decoration: OutputPolicy.Decoration): Renderer.Options {
        if (decoration === 'on') return {};
        return OutputPolicy.plain();
    }

    /**
     * The renderer of a channel that carries content and nothing else: no timestamp, level nor name, and
     * no separator either, which is what keeps a transcript greppable and free of the group it was written in.
     * @returns The renderer of a plain channel.
     */
    protected static plain(): Renderer.Options {
        return {
            timestamp: false,
            level: false,
            name: false,
            messageFormat: '{line}'
        };
    }

    /**
     * The visible identity of a command: the position it holds inside its own task, qualified by the
     * position of the step it runs in only when the pipeline has more than one of them.
     * @param identity - The step the command runs in.
     * @param ordinal - The position of the command inside its task, starting at 1.
     * @returns The identity of the command.
     */
    protected static identity(identity: OutputPolicy.Identity, ordinal: number): string {
        return identity.step === null ? `C${ordinal}` : `S${identity.step} · C${ordinal}`;
    }

    /**
     * The label of a command thinned to what identifies it: the executable of a program or the first word
     * of a script, cut to the width a line can carry and closed with an ellipsis when it does not fit.
     * @param label - The human readable form of the command, whole.
     * @returns The label as it is shown.
     */
    protected static label(label: string): string {
        const head = label.trim().split(/\s+/)[0];
        return head.length <= OutputPolicy.LABEL_LENGTH ? head : `${head.slice(0, OutputPolicy.LABEL_LENGTH - 1)}…`;
    }

    /**
     * How a command ended, in the few words a marker line carries: why there is no result at all, or the
     * status or the signal of the process when there is one.
     * @param result - The result of the command.
     * @returns The way the command ended.
     */
    protected static reason(result: Task.commandResult): string {
        if (result.reason === 'timeout') return 'timed out';
        if (result.reason === 'stopped') return 'stopped';
        if (result.reason === 'shell') return 'shell exited';
        if (result.reason === 'spawn') return 'could not be started';
        if (result.reason === 'protocol') return 'no status reported';
        if (result.signal !== null) return `signal ${result.signal}`;
        return `exit ${result.code}`;
    }

    /**
     * The result line of a command that ended as it was asked to, which says so about the command and not
     * about the step it belongs to.
     * @param who - The visible identity of the command.
     * @returns The result line of the command.
     */
    protected static completed(who: string): string { return `&C2✔ ${who} completed`; }

    /**
     * The result line of a command that failed, told apart from one that never had a result to report.
     * @param who - The visible identity of the command.
     * @param result - The result of the command.
     * @returns The result line of the command.
     */
    protected static verdict(who: string, result: Task.commandResult): string {
        if (result.reason !== null) return `&C3⊘ ${who} ${OutputPolicy.reason(result)}`;
        return `&C1✘ ${who} failed`;
    }

    /**
     * The single line a silent run shows about a command that failed: the marker, who the command was, what
     * it was and how it ended, with nothing of what it printed.
     * @param who - The visible identity of the command.
     * @param result - The result of the command.
     * @returns The line about the command.
     */
    protected static terse(who: string, result: Task.commandResult): string {
        if (result.reason !== null) return `&C3⊘ ${who} ${OutputPolicy.reason(result)}  ${OutputPolicy.label(result.label)}`;
        return `&C1✘ ${who} failed  ${OutputPolicy.label(result.label)} · ${OutputPolicy.reason(result)}`;
    }
}
export namespace OutputPolicy {
    export type Verbosity = 'default' | 'verbose' | 'silent';
    export type Decoration = 'on' | 'off';
    export type Channel = 'stdout' | 'stderr';
    export type Level = 'info' | 'error';

    /** Who the commands of a task are reported as: the step they run in, when they run inside a pipeline. */
    export interface Identity {
        /** The position of the step of the pipeline, starting at 1, or `null` outside a pipeline. */
        step: number | null;
    }

    /** What a run asked for: the logger its evidence is kept in, and the mode it asked to be run in. */
    export interface Info {
        /**
         * The logger the evidence of the run is kept in: the channels of the policy attach to its file
         * transport, so where the evidence lands is decided here and kept by the run that was asked for it.
         */
        logger: Logger;
        /** The name the channels of the policy are reported with. */
        name: string;
        /** Whether the output of the commands is shown as it comes. */
        verbose: boolean;
        /** Whether the run said as little as it can without hiding that something failed. */
        silent: boolean;
        /** Whether the output is drawn inside boxes, with timestamps, levels and names. */
        decorate: boolean;
    }
}
export default OutputPolicy;

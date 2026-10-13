/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the modes of the CLI as a user asks for them: the flags that select
 *              them, the exit status every one of them keeps, and the evidence each of them leaves.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { Logger } from '@netfeez/vterm';
import { File, Path } from '@netfeez/common-node';

import Builder from '../src/builder/Builder.js';
import OutputPolicy from '../src/task/OutputPolicy.js';
import Task from '../src/task/Task.js';
import Git from '../src/dependency/Git.js';
import NpmDependency from '../src/dependency/NpmDependency.js';
import { options } from '../src/cli/DepFLowCLI.js';
import schema from '../src/schema/schema.js';
import { body, captureOutput, createTemp, readEvidence, removeTemp, runCli, strip, unmarked } from './utils.js';

const suite = new TestSuite('cli modes');

/** The configuration file every project of the suite is driven with. **/
const CONFIG = 'depflow.json';

/** The script every case runs, so what it says and how it ends is the same in all of them. **/
const FAILS = 'node -e "console.log(\'to-stdout\'); console.error(\'to-stderr\'); process.exit(1)"';
const SUCCEEDS = 'node -e "console.log(\'to-stdout\'); console.error(\'to-stderr\')"';

/**
 * Writes a project whose only action runs the given script, so the CLI has a command whose commands fail
 * on demand without a repository, a network or a package manager anywhere in the way.
 *
 * @remarks The action is a pipeline of build entries and not a list of scripts, so the script is written
 * as the `run` of a single entry: that is the shape `config.schema` accepts, and a case that writes
 * anything else is answered by the validation of the configuration instead of by the mode under test.
 * @param root - The root of the project.
 * @param script - The script the action of the project runs.
 * @returns A promise resolving to the path of the configuration file.
 **/
async function project(root: string, script: string = FAILS): Promise<void> {
    await File.write(Path.join(root, CONFIG), JSON.stringify({ actions: { check: [ { run: script } ] } }, null, 4));
}

/**
 * Creates a project directory and writes its configuration in one go.
 * @param dir - The temporary directory holding the project.
 * @param script - The script the action of the project runs.
 * @returns A promise resolving to the root of the project.
 **/
async function projectIn(dir: string, script: string = FAILS): Promise<string> {
    const root = Path.join(dir, 'project');
    await File.ensureDir(root);
    await project(root, script);
    return root;
}

/** Runs `dep run check` with the given flags and resolves to the status and to what the run said. **/
async function run(root: string, flags: string[] = []): Promise<{ code: number | null, stdout: string, stderr: string, output: string }> {
    return runCli([ 'run', 'check', '-f', CONFIG, ...flags ], root);
}

/**
 * What a process wrote, as plain text, one entry per line.
 *
 * @remarks The entry a final newline leaves behind is dropped: a process that ends its last line with a
 * newline has not written an empty line, it has closed the one it wrote. A blank line *between* two lines
 * is left where it is, because that is a line a process really did write.
 **/
function read(output: string): string[] {
    const lines = strip(output).split(/\r?\n/);
    return lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
}

/** What a process wrote, as plain text, without the lines that carry nothing. **/
function content(output: string): string[] { return read(output).filter(line => line.trim() !== ''); }

/** How many of the lines a process wrote are exactly this text. **/
function linesSaid(lines: string[], said: string): number { return lines.filter(line => line.trim() === said).length; }

/** The head a decorated line carries, so two runs of the same help can be compared past the clock. **/
function withoutClock(output: string): string { return output.replace(/\[\d{4}-\d{2}-\d{2}\] \[\d{2}:\d{2}:\d{2}\]/g, '[when]'); }

/** Builds a policy whose evidence lands in a file of the given directory, named apart from the others. **/
function policy(dir: string, name: string, mode: { verbose?: boolean, silent?: boolean, decorate?: boolean } = {}): OutputPolicy {
    return new OutputPolicy({
        logger: new Logger({ name: 'depflow', save: true, path: Path.join(dir, `${name}.vlog`) }),
        name: 'depflow',
        verbose: mode.verbose === true,
        silent: mode.silent === true,
        decorate: mode.decorate ?? true
    });
}

/** Runs an action with the console captured, and resolves to the lines it wrote, without the empty ones. **/
async function said(action: () => Promise<unknown>): Promise<string[]> {
    return content((await captureOutput(action)).text);
}

//
// ====== Silent, as the CLI is asked for it ======
//

suite.add('every mode of a failing run keeps the same exit status', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const decorated = await run(root);
        const silent = await run(root, [ '--silent' ]);
        const verbose = await run(root, [ '--verbose' ]);
        const undecorated = await run(root, [ '--decorate=false' ]);

        context.expect(decorated.code).equals(1);
        context.expect(silent.code).equals(decorated.code);
        context.expect(verbose.code).equals(decorated.code);
        context.expect(undecorated.code).equals(decorated.code);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run of the CLI says nothing at all when every command ended well', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir, SUCCEEDS);
        const decorated = await run(root);
        const silent = await run(root, [ '--silent' ]);

        context.expect(decorated.code).equals(0);
        context.expect(strip(decorated.stdout)).includes('Running action');
        context.expect(strip(decorated.stdout)).includes('C1 completed');
        context.expect(content(silent.stdout).length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run of the CLI keeps the marker of the command that failed, and nothing else', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const { code, stdout } = await run(root, [ '--silent' ]);

        context.expect(code).equals(1);
        context.expect(strip(stdout)).includes('C1 failed');
        context.expect(strip(stdout)).includes('exit 1');
        context.expect(strip(stdout).includes('to-stdout')).equals(false);
        context.expect(strip(stdout).includes('to-stderr')).equals(false);
        context.expect(strip(stdout).includes('Running action')).equals(false);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the complete buffer of a command reaches the evidence of a silent run of the CLI', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const { code, stdout } = await run(root, [ '--silent' ]);
        const evidence = await readEvidence(root);

        context.expect(code).equals(1);
        context.expect(strip(stdout).includes('to-stdout')).equals(false);
        context.expect(evidence).includes('to-stdout');
        context.expect(evidence).includes('to-stderr');
        context.expect(evidence).includes('Command failed with status 1');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a command line the parser rejects is answered even when the run asked to be silent', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir, SUCCEEDS);
        const { code, output } = await runCli([ 'run', 'check', '-f', CONFIG, '--silent', '--vervose' ], root);

        context.expect(code).equals(1);
        context.expect(strip(output)).includes('Unknown flag: --vervose');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run still detects the failure and still stops the pipeline', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const { code, stdout } = await run(root, [ '--silent' ]);

        // The screen is not what stopped: the command failed, the task noticed, the step stopped and the
        // pipeline rejected. A silent run changes how that is said and nothing else.
        context.expect(code).equals(1);
        context.expect(strip(stdout).includes('C1 failed')).equals(true);
        context.expect(strip(stdout)).includes('Step 1 stopped the pipeline');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('silent wins over verbose in the CLI, whichever order they were written in', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const silentFirst = await run(root, [ '--silent', '--verbose' ]);
        const verboseFirst = await run(root, [ '--verbose', '--silent' ]);

        context.expect(silentFirst.code).equals(1);
        context.expect(verboseFirst.code).equals(1);
        context.expect(strip(silentFirst.stdout).includes('to-stdout')).equals(false);
        context.expect(strip(verboseFirst.stdout).includes('to-stdout')).equals(false);
        context.expect(strip(silentFirst.stdout)).includes('C1 failed');
        context.expect(strip(verboseFirst.stdout)).includes('C1 failed');
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== Decoration, as the CLI is asked for it ======
//

suite.add('an undecorated run leaves no line behind where the box would have been', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const decorated = await run(root);
        const undecorated = await run(root, [ '--decorate=false' ]);

        context.expect(strip(decorated.stdout)).includes('╭');
        context.expect(strip(undecorated.stdout).includes('╭')).equals(false);
        context.expect(strip(undecorated.stdout).includes('│')).equals(false);
        context.expect(strip(undecorated.stdout).includes('╰')).equals(false);
        context.expect(read(undecorated.stdout).filter(line => line.trim() === '').length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the decoration lives inside the width of the line and never loses a word of the run', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const decorated = await run(root);
        const undecorated = await run(root, [ '--decorate=false' ]);

        // The decoration paints its head and its rails inside the width the renderer is given instead of
        // widening the line, so a decorated line wraps its content earlier than an undecorated one does
        // and the two renders are not the same lines. What they do share is the words of the run, in the
        // order it said them: a render wraps a line, it does not drop or invent a word of it.
        const words = (output: string): string[] => body(read(output)).join(' ').split(/\s+/).filter(Boolean);
        const withBox = words(decorated.stdout);
        const withoutBox = words(undecorated.stdout);

        context.expect(decorated.code).equals(undecorated.code);
        context.expect(withoutBox.length).equals(withBox.length);
        context.expect(withoutBox.join(' ')).equals(withBox.join(' '));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('an undecorated run renders a long line without losing any of it', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        // The character is written as its code so the only `z` in the run is the one the command printed,
        // and the diagnostic of the failure, which repeats the command line, adds none.
        const root = await projectIn(dir, 'node -e "console.log(String.fromCharCode(122).repeat(5000)); process.exit(1)"');
        const { code, stdout } = await run(root, [ '--decorate=false' ]);

        // The width a rendered line is given belongs to the terminal, so what is asserted is that every
        // character the command wrote reaches the render, and not how many of them shared a line.
        const said = body(read(stdout)).join('');
        context.expect(code).equals(1);
        context.expect(said.split('z').length - 1).equals(5000);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a silent run without decoration of the CLI says exactly what a silent run says', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const silent = await run(root, [ '--silent' ]);
        const quiet = await run(root, [ '--silent', '--decorate=false' ]);

        const bare = body(read(quiet.stdout));
        context.expect(silent.code).equals(quiet.code);
        context.expect(bare[0]).includes('✘ C1 failed');
        context.expect(bare[0].includes(' -> ')).equals(false);
        const padded = (output: string): string => body(read(output)).map(line => line.trimEnd()).join('\n');
        context.expect(padded(quiet.stdout)).equals(padded(silent.stdout));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the help of the console interface does not change with the mode of the run', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir, SUCCEEDS);
        const decorated = await runCli([ 'help' ], root);
        const undecorated = await runCli([ 'help', '--decorate=false' ], root);
        const silent = await runCli([ 'help', '--silent' ], root);

        // The help is drawn by the console interface, which the modes never reach: it is the same text
        // whatever the run was asked to be. The clock was the only thing that differed between two of
        // these runs, and it no longer reaches the help either.
        const said = withoutClock(strip(decorated.stdout));
        context.expect(decorated.code).equals(0);
        context.expect(withoutClock(strip(undecorated.stdout))).equals(said);
        context.expect(withoutClock(strip(silent.stdout))).equals(said);
        context.expect(said.includes('DepFlow CLI')).equals(true);

        // R-24.3 lands in two places now: the help belongs to the console interface, so it lists the
        // global flags with their descriptions along with the commands and their arguments.
        context.expect(said.includes('--silent')).equals(true);
        context.expect(options.declaration.silent.description).includes('not the help');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('an unknown command is answered by the console interface, whatever the mode asked for', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir, SUCCEEDS);
        const decorated = await runCli([ 'nope', '-f', CONFIG ], root);
        const silent = await runCli([ 'nope', '-f', CONFIG, '--silent' ], root);
        const undecorated = await runCli([ 'nope', '-f', CONFIG, '--decorate=false' ], root);

        // The status of this path is a known deviation from R-27.3 and out of scope (R-26.2), so what this
        // case claims is the one thing the contract does pin down here: the invocation is answered in
        // every mode, by the surface that owns the answer.
        context.expect(strip(decorated.stdout)).includes('Unknown command: nope');
        context.expect(strip(silent.stdout)).includes('Unknown command: nope');
        context.expect(strip(undecorated.stdout)).includes('Unknown command: nope');
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== Default and verbose, as the CLI is asked for them ======
//

suite.add('a failing command of the CLI is reported once, with both channels labelled', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const { code, stdout } = await run(root);
        const said = body(read(stdout));

        // The diagnostic carries the whole command, and the command prints the very words the buffer is
        // checked for, so what is counted is the line and not the text: one line is one rendering of it.
        context.expect(code).equals(1);
        context.expect(linesSaid(said, '✘ C1 failed')).equals(1);
        context.expect(linesSaid(said, 'stdout:')).equals(1);
        context.expect(linesSaid(said, 'to-stdout')).equals(1);
        context.expect(linesSaid(said, 'stderr:')).equals(1);
        context.expect(linesSaid(said, 'to-stderr')).equals(1);
        context.expect(said.filter(line => line.startsWith('Command failed with status 1')).length).equals(1);
        context.expect(strip(stdout)).includes('Step 1 stopped the pipeline');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a verbose run of the CLI streams what the command wrote, and does not reprint it', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        const { code, stdout } = await run(root, [ '--verbose' ]);
        const said = body(read(stdout));
        const streamed = said.join('\n');

        context.expect(code).equals(1);
        context.expect(streamed).includes('[C1]');
        context.expect(linesSaid(said, 'to-stdout')).equals(1);
        context.expect(linesSaid(said, 'to-stderr')).equals(1);
        context.expect(linesSaid(said, '✘ C1 failed')).equals(1);
        context.expect(linesSaid(said, 'stdout:')).equals(0);
        context.expect(linesSaid(said, 'stderr:')).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the complete buffer of a command reaches the evidence of a decorated run of the CLI', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        await run(root);
        const evidence = await readEvidence(root);

        context.expect(evidence).includes('[C1]');
        context.expect(evidence).includes('to-stdout');
        context.expect(evidence).includes('to-stderr');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the evidence of the CLI is a transcript and not a copy of a screen', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const root = await projectIn(dir);
        await run(root, [ '--silent' ]);
        const evidence = unmarked(await readEvidence(root));

        // Every channel of a run saves into the same file and the report keeps its head, so the file is
        // read in two: the lines that carry a head are the report, and the rest is what the commands
        // wrote. A transcript line is the content and nothing else, which is what a grep can reach.
        const said = evidence.split(/\r?\n/).filter(line => line.trim() !== '');
        const transcript = said.filter(line => !/^\[[^\]]*\] \[[^\]]*\] \[[A-Z]+\] \[/.test(line));

        context.expect(transcript.filter(line => line.startsWith('[C1]')).length).equals(1);
        context.expect(transcript.filter(line => line.startsWith('Command failed with status 1')).length).equals(1);
        context.expect(linesSaid(transcript, 'stdout:')).equals(1);
        context.expect(linesSaid(transcript, 'to-stdout')).equals(1);
        context.expect(linesSaid(transcript, 'stderr:')).equals(1);
        context.expect(linesSaid(transcript, 'to-stderr')).equals(1);
        context.expect(transcript.filter(line => /[│╭╰├]/.test(line)).length).equals(0);
        context.expect(transcript.filter(line => /\[\d{4}-\d{2}-\d{2}\]/.test(line)).length).equals(0);
        context.expect(transcript.filter(line => /\[(LOG|INF|WRN|ERR|DBG)\]/.test(line)).length).equals(0);
        context.expect(transcript.filter(line => line.includes(' -> ')).length).equals(0);
        context.done();
    } finally { await removeTemp(dir); }
});

//
// ====== Builder ======
//

/** Exposes the protected {@link Builder.runTask}, so a case can drive the builder as a pipeline step does. **/
class ExposedBuilder extends Builder {

    /**
     * Runs commands as a task, reporting them through the policy the builder was given.
     * @param commands - The commands to run, as the shell scripts of a `run` step.
     * @param identity - The identity the commands are reported under.
     * @returns A promise resolving to the summary of the run.
     **/
    public async commands(commands: string[], identity: OutputPolicy.Identity): Promise<Task.FinishData> {
        return this.runTask(commands, this.cwd, {}, identity);
    }
}

/** Exposes the protected {@link Git.runTask}, so a case can drive git as an acquisition of a dependency does. **/
class ExposedGit extends Git {

    /**
     * Runs the instructions of a git operation as a task, reporting them through the given policy.
     * @param instructions - The git instructions to run.
     * @param cwd - The working directory the task runs in.
     * @param policy - The policy the commands are reported through.
     * @returns A promise resolving once every instruction ran.
     **/
    public static async commands(instructions: Task.Instruction[], cwd: string, policy: OutputPolicy): Promise<void> {
        return this.runTask(instructions, { cwd, policy });
    }
}

/** Builds a pipeline the way a config does, so the defaults of every step are resolved. **/
function pipeline(...entries: unknown[]): schema.Builder { return schema.Builder.processUnknown(entries); }

suite.add('the builder, git and npm present the same task the same way', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const byBuilderPolicy = policy(dir, 'builder', { decorate: false });
        const builder = new ExposedBuilder({
            cwd: dir, projectRoot: dir, logger: byBuilderPolicy.report, policy: byBuilderPolicy,
            pipeline: pipeline({ run: 'node -e "true"' })
        });
        const byBuilder = await said(() => builder.commands([ FAILS ], { step: null }));

        const byGit = await said(() => ExposedGit.commands([ FAILS ], dir, policy(dir, 'git', { decorate: false })));

        const flow = Path.join(dir, '.depflow');
        await File.ensureDir(Path.join(flow, 'node_modules', 'omega'));
        const npm = new NpmDependency(flow, dir, { name: 'omega', version: '1.0.0', builder: pipeline({ run: FAILS }), resolver: {} }, null, policy(dir, 'npm', { decorate: false }));
        const byNpm = await said(() => npm.build());

        // The same `Task` is presented by the same policy in the three paths, so what it said about the
        // command is the same text. The step marker is not part of that: `Git.runTask` and
        // `NpmDependency.install` own the step they ran, and the builder hands the failure to the step
        // that owns it, so at this boundary the builder has one line less and says it once.
        context.expect(byBuilder.length > 0).equals(true);
        context.expect(linesSaid(byBuilder, '✘ C1 failed')).equals(1);
        context.expect(linesSaid(byBuilder, 'to-stdout')).equals(1);
        context.expect(linesSaid(byBuilder, 'to-stderr')).equals(1);
        context.expect(linesSaid(byBuilder, '✘ step failed')).equals(0);

        for (const by of [ byGit, byNpm ]) {
            context.expect(by.slice(0, byBuilder.length).join('\n')).equals(byBuilder.join('\n'));
            context.expect(by.length).equals(byBuilder.length + 1);
            context.expect(linesSaid(by, '✘ step failed')).equals(1);
        }
        context.expect(byGit.join('\n')).equals(byNpm.join('\n'));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a pipeline that fails leaves the group of vterm closed', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const run = policy(dir, 'group');
        const builder = new Builder({
            cwd: dir,
            projectRoot: dir,
            logger: run.report,
            policy: run,
            pipeline: pipeline({ run: 'node -e "process.exit(1)"' })
        });

        const captured = await captureOutput(async () => {
            try { await builder.run(); }
            catch { /* the failure of the pipeline is the point of the case */ }
        });
        const drawn = read(captured.text);
        const opened = drawn.filter(line => line.includes('╭')).length;
        const closed = drawn.filter(line => line.includes('╰')).length;

        context.expect(opened > 0).equals(true);
        context.expect(closed > 0).equals(true);
        context.expect(opened).equals(closed);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('a pipeline that succeeds leaves the group of vterm closed as well', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const run = policy(dir, 'group-ok');
        const builder = new Builder({ cwd: dir, projectRoot: dir, logger: run.report, policy: run, pipeline: pipeline({ run: SUCCEEDS }) });

        const captured = await captureOutput(() => builder.run());
        const drawn = read(captured.text);
        const opened = drawn.filter(line => line.includes('╭')).length;
        const closed = drawn.filter(line => line.includes('╰')).length;

        context.expect(opened).equals(closed);
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('the steps a stopped pipeline left behind are reported as steps that never ran', async (context) => {
    const dir = await createTemp('depflow modes');
    try {
        const builder = new Builder({
            cwd: dir,
            projectRoot: dir,
            pipeline: pipeline({ run: 'node -e "process.exit(1)"' }, { run: 'node -e "process.exit(0)"' }, { run: 'node -e "process.exit(0)"' })
        });

        try {
            await builder.run();
            context.fail('expected the pipeline to reject on the first step that failed');
        } catch (error) {
            const report = (error as Builder.Failure).report;
            context.expect(report.steps.map(step => step.ran).join(' ')).equals('true false false');
            context.expect(report.steps.map(step => step.ran ? step.commands.length : 0).join(' ')).equals('1 0 0');
        }
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;

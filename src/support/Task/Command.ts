import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { Events } from "@netfeez/common";

export class Command extends Events<Command.EventMap> {
    protected shell: ChildProcessWithoutNullStreams;
    protected command: string;
    protected activeListeners: { stdout: Command.StdOut, stderr: Command.StdErr } | null = null;

    public constructor(shell: ChildProcessWithoutNullStreams, command: string) { super();
        this.shell = shell;
        this.command = command;
    }
    /**
     * Executes a command using the provided shell instance, returning a promise that resolves with the command's output, execution time, and success status.
     * This method sets up listeners for the shell's stdout and stderr streams to capture the command's output and errors in real-time.
     * It also handles the command's completion by listening for a specific marker in the output, allowing it to determine when the command has finished executing and to capture its exit status.
     * The method ensures that all listeners are properly cleaned up after execution to prevent memory leaks and unintended side effects on subsequent commands executed with the same shell instance.
    */
    public exec(): void {
        const marker = `__DEF_FLOW_END_${Date.now()}__`;
        const statusKey = `__EXIT_STATUS_${Date.now()}__`;
        let accumulator = '';

        const isWin = process.platform === 'win32';
        const getStatusCmd = isWin 
            ? `echo ${statusKey}=%errorlevel%` 
            : `echo ${statusKey}=$?`;

        const stdoutListener = (data: Buffer) => {
            const chunk = data.toString();
            accumulator += chunk;

            if (!chunk.includes(marker) && !chunk.includes(statusKey)) {
                this.emit('log', chunk.trim());
            }

            if (accumulator.includes(marker)) {
                const statusMatch = accumulator.match(new RegExp(`${statusKey}=(\\d+)`));
                const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
                
                this.cleanup();
                const msg = accumulator.replace(getStatusCmd, '').replace(marker, '').trim();
                this.emit('end', statusCode, msg);
            }
        };

        const stderrListener = (data: Buffer) => {
            const msg = data.toString().trim();
            if (msg) this.emit('err', msg);
        };
        this.activeListeners = { stdout: stdoutListener, stderr: stderrListener };
        
        this.shell.stdout.on('data', stdoutListener);
        this.shell.stderr.on('data', stderrListener);

        this.shell.once('error', (error) => {
            this.cleanup();
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emit('err', `Fatal Shell Error: ${errorMsg}`);
            this.emit('end', -1, errorMsg);
        });

        this.shell.stdin.write(`${this.command}\n`);
        this.shell.stdin.write(`${getStatusCmd}\n`);
        this.shell.stdin.write(`echo ${marker}\n`);
    }
    /**
     * Cleans up the listeners attached to the shell's stdout and stderr streams after command execution, ensuring that no residual listeners remain that could interfere with subsequent commands or cause memory leaks.
     * This method is called after a command finishes executing, regardless of whether it succeeded or failed, to ensure that the TaskManager can safely execute new commands without unintended side effects from previous listeners.
     * It checks if there are active listeners and, if so, removes them from the shell's stdout and stderr streams before resetting the activeListeners reference to null.
     * By centralizing the cleanup logic in this method, it promotes better resource management and helps maintain the stability and reliability of the command execution process within the TaskManager.
     */
    protected cleanup(): void {
        if (!this.activeListeners) return;
        this.shell.stdout.off('data', this.activeListeners.stdout);
        this.shell.stderr.off('data', this.activeListeners.stderr);
        this.activeListeners = null;
    }
    /**
     * Creates a new shell instance using the appropriate shell executable based on the operating system, returning a promise that resolves with the created shell process.
     * This method abstracts the logic for determining which shell to use (e.g., cmd.exe for Windows and bash for Unix-like systems) and handles the creation of the shell process with the necessary stdio configuration.
     * By returning a promise, it allows callers to easily integrate shell creation into asynchronous workflows, ensuring that they can await the availability of the shell before attempting to execute commands.
     * If the shell process fails to start, the promise will be rejected with an appropriate error message, allowing callers to handle such scenarios gracefully.
     */
    public static async createShell(): Promise<Command.ShellComponents> {
        const ac = new AbortController();
        const shellExecutable = process.platform === 'win32' ? 'cmd.exe' : 'bash';
        const shell = spawn(shellExecutable, { shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'], signal: ac.signal });
        shell.unref();
        ac.signal.addEventListener('abort', () => {
            if (shell.stderr) shell.stderr.destroy();
            if (shell.stdout) shell.stdout.destroy();
            if (shell.stdin) shell.stdin.destroy();
            if (process.platform !== 'win32' && shell.pid) {
                try { process.kill(-shell.pid, 'SIGKILL'); } catch (e) {}
            }
        });
        return { shell, abort: (reason?: any) => ac.abort(reason) };
    }
}

export namespace Command {
    export type Emitter = Events.Emitter<EventMap>;
    export type StdOut = (output: Buffer) => void;
    export type StdErr = (error: Buffer) => void;
    export type Abort = (reason?: any) => void;
    export type Shell = ChildProcessWithoutNullStreams;
    export type EventMap = {
        log: [message: string];
        err: [message: string];
        end: [code: number, message: string];
    };
    export interface ShellComponents {
        shell: Shell;
        abort: Abort;
    }
}

export default Command;
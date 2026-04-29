export class Async {
    public static async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Asynchronously waits for a specific event to occur by executing the provided executor function.
     * The executor function is expected to call a done callback when the event occurs, passing any relevant result.
     * The method also supports an optional timeout parameter, which will reject the promise if the event does not occur within the specified time frame.
     * 
     * @param executor - A function that executes the logic to wait for the event and calls the done callback when the event occurs.
     * @param timeout - An optional timeout in milliseconds after which the promise will be rejected if the event has not occurred (default is -1, meaning no timeout).
     * @returns A promise that resolves with the result passed to the done callback when the event occurs, or rejects if an error occurs or if the timeout is reached.
     */
    public static async awaitEvent<R extends any>(
        executor: Async.AsyncEvent.Exec<R>,
        timeout: number = -1
    ): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            let timer: NodeJS.Timeout | null = null;
            let isSettled = false;
            let cleanupHandler: Async.AsyncEvent.Clean | void;

            const cleanup = () => {
                isSettled = true;
                if (!timer) return;
                clearTimeout(timer);
                timer = null;
                if (typeof cleanupHandler === 'function') {
                    cleanupHandler();
                }
            };

            const safeResolve = (result: R) => {
                if (isSettled) return;
                cleanup();
                resolve(result);
            };

            const safeReject = (err: any) => {
                if (isSettled) return;
                cleanup();
                reject(err instanceof Error ? err : new Error(String(err)));
            };

            if (timeout > 0) {
                timer = setTimeout(() => {
                    safeReject(new Error(`Async event timed out after ${timeout}ms`));
                }, timeout);
            }

            try {
                const result = executor(safeResolve, safeReject);
                if (result instanceof Promise) {
                    result.then(h => { cleanupHandler = h; }).catch(safeReject);
                } else {
                    cleanupHandler = result;
                }
            } catch (error) { safeReject(error); }
        });
    }
}
export namespace Async {
    export namespace AsyncEvent {
        export type Clean = () => void;
        export type Done<R> = (result: R) => void;
        export type Fail = (error: Error) => void;
        export type Exec<R> = (done: Done<R>, fail: Fail) => Clean | Promise<Clean> | void | Promise<void>;
    }
}
export default Async;
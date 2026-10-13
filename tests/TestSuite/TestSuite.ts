/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Minimal asynchronous test suite runner with vterm logging, used by the project tests.
 * @license Apache-2.0
 */

import { ConsoleTransport, Engine } from '@netfeez/vterm';

import TestContext from "./TestContext.js";
import _Utils from "./Utils.js";

export { _Utils as utils };

export class TestSuite {
    protected readonly engine: Engine
    protected readonly transport: ConsoleTransport

    protected vName: string;
    protected vTests: TestSuite.TestEntry[] = [];
    protected vPasses: number = 0;
    protected vFails: number = 0;

    /**
     * Creates a test suite with a cleaned name and its own engine.
     * @param name - The display name of the suite (trimmed and lower-cased).
     */
    public constructor(name: string) {
        this.vName = TestSuite.cleanName(name);
        this.engine = new Engine({ name: this.prefix, renderer: { columns: () => process.stdout.columns ?? 100 } });
        this.transport = new ConsoleTransport();
        this.transport.attach(this.engine);
    }

    /** The trimmed, lower-cased name of the suite. */
    public get name(): string { return this.vName; }

    /** The engine prefix used for suite messages. */
    public get prefix(): string { return `suit:${this.name}`; }

    /** How many cases of this suite passed. */
    public get passes(): number { return this.vPasses; }

    /** How many cases of this suite failed. */
    public get fails(): number { return this.vFails; }

    //
    // ====== test control methods ======
    //

    /**
     * Adds a test case to the test suite with a description and a test function. The test function is expected to be an asynchronous function that takes a TestContext as an argument and performs assertions using that context. This method allows for organizing multiple test cases under a single test suite, each with its own description for clarity in logging and reporting.
     * @param description - A string describing the test case, which will be used for logging purposes to identify the test being added to the suite.
     * @param test - A function that contains the actual test code. This function is expected to be an asynchronous function that takes a TestContext as an argument and performs assertions using that context.
     */
    public add(description: string, test: TestSuite.Test): void {
        this.vTests.push({ description, test });
    }

    /**
     * Runs a series of test cases defined in an array of TestSuite.Test functions. Each test case is executed sequentially, and the method waits for each test to complete before starting the next one. The method returns a promise that resolves to true if all tests passed, or false if any test failed.
     * @param tests - An array of test functions, where each function is a TestSuite.Test that defines a test case to be executed. Each test function is executed with a TestContext as its `this` context and as an argument, allowing it to log messages and mark the test as done.
     * @returns A promise that resolves to true if all tests passed, or false if any test failed.
     */
    public async run(tests: TestSuite.TestEntry[] = this.vTests): Promise<boolean> {
        this.vPasses = 0;
        this.vFails = 0;
        for (const test of tests) {
            if (await this.test(test.description, test.test)) this.vPasses += 1;
            else this.vFails += 1;
        }
        return this.vFails === 0;
    }
    
    /**
     * Defines a test case with a description and a test function. The test function is executed with a TestContext that provides methods for logging and marking the test as done.
     * The method logs the start of the test, executes the test function, and handles any errors that may occur during the execution.
     * It also logs the result of the test (passed or failed) based on whether the test context's done method was called with an error or not.
     * @param description - A string describing the test case, which is used for logging purposes to identify the test being executed.
     * @param test - A function that contains the actual test code. This function is executed with a TestContext as its `this` context and as an argument, allowing it to log messages and mark the test as done.
     *
     * @remarks An error escaping the test body fails it even when it already reported success: a case
     * that cleans up after itself in a `finally` and fails there did not do what it claimed, and
     * counting it as a pass would report a suite that is not the one that ran.
     */
    public async test(description: string, test: TestSuite.Test): Promise<boolean> {
        const logPrefix = '&C(#FFB4DC)'
        const context = new TestContext(this.engine, this.name, `${logPrefix}│  `);

        this.engine.info(`${logPrefix}╭─────────────────────────────────────────────`);
        this.engine.info(`${logPrefix}│ &C6${TestSuite.Utils.splitTexts(description, 44).join(`\n${logPrefix}│ &C6`)}`);
        this.engine.info(`${logPrefix}├─────────────────────────────────────────────`);
        let escaped: boolean = false;
        try {
            await test.call(context, context);
            if (context.passed) {
                this.engine.log(`${logPrefix}│ &C2✔ Test passed`); 
            } else {
                this.engine.warn(`${logPrefix}│ &C3⚠ Test finished without explicit done()`);
            }
        } catch (error) {
            escaped = true;
            const stack = error instanceof Error ? error.stack ?? error.message : String(error);
            this.engine.error(`${logPrefix}│ &C1✖ ${stack.split('\n').join(`\n${logPrefix}│ &C1`)}`);
        } finally { this.engine.info(`${logPrefix}╰─────────────────────────────────────────────`); }
        return !escaped && context.passed === true;
    }

    //
    // ====== support methods ======
    //

    /**
     * Cleans the test suite name by trimming whitespace and converting it to lowercase.
     * This ensures that the name is standardized and can be used consistently for logging and identification purposes.
     * The cleaned name is returned as a string.
     * 
     * @param name - The original name of the test suite, which may contain leading or trailing whitespace and may be in mixed case.
     * @returns The cleaned name of the test suite, which is trimmed and converted to lowercase.
     */
    private static cleanName(name: string): string {
        return name.trim().toLowerCase();
    }
}
export namespace TestSuite {
    export import Utils = _Utils;

    export type Test = (this: TestContext, test: TestContext) => Promise<void> | void;

    export interface TestEntry {
        description: string;
        test: Test;
    }
}
export default TestSuite;
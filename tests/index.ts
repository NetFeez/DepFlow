/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Test entry point: runs every regression suite and sets a non-zero exit code on any failure.
 * @license Apache-2.0
 */
import TestSuite from './TestSuite/TestSuite.js';

import builderSuite from './Builder.test.js';
import aliasCompilerSuite from './AliasCompiler.test.js';
import pathRewriterSuite from './PathRewriter.test.js';
import configSuite from './Config.test.js';
import dependencySuite from './Dependency.test.js';
import taskSuite from './Task.test.js';
import cliSuite from './DepFlowCLI.test.js';

const suites: TestSuite[] = [
    builderSuite,
    aliasCompilerSuite,
    pathRewriterSuite,
    configSuite,
    dependencySuite,
    taskSuite,
    cliSuite
];

let failures = 0;
for (const suite of suites) {
    if (!await suite.run()) failures += 1;
}
process.exitCode = failures > 0 ? 1 : 0;
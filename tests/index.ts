/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Test entry point: runs every regression suite, reports honest totals and sets a
 *              non-zero exit code on any failure.
 * @license Apache-2.0
 */
import { Logger } from '@netfeez/vterm';

import TestSuite from './TestSuite/TestSuite.js';

import builderSuite from './Builder.test.js';
import aliasCompilerSuite from './AliasCompiler.test.js';
import pathResolverSuite from './PathResolver.test.js';
import pathRewriterSuite from './PathRewriter.test.js';
import configSuite from './Config.test.js';
import dependencySuite from './Dependency.test.js';
import flagsSuite from './Flags.test.js';
import outputPolicySuite from './OutputPolicy.test.js';
import taskSuite from './Task.test.js';
import cliSuite from './DepFlowCLI.test.js';
import cliModesSuite from './CliModes.test.js';
import editingSuite from './Editing.test.js';
import endToEndSuite from './EndToEnd.test.js';

const suites: TestSuite[] = [
    builderSuite,
    aliasCompilerSuite,
    pathResolverSuite,
    pathRewriterSuite,
    configSuite,
    dependencySuite,
    flagsSuite,
    outputPolicySuite,
    taskSuite,
    cliSuite,
    cliModesSuite,
    editingSuite,
    endToEndSuite
];

const logger = new Logger({ name: 'TOTAL' });
let passes = 0;
let fails = 0;
for (const suite of suites) {
    await suite.run();
    passes += suite.passes;
    fails += suite.fails;
    logger.log(`${suite.fails === 0 ? '&C2✔' : '&C1✖'} ${suite.name}: &C7${suite.passes} passed, ${suite.fails} failed`);
}

logger.log(`&C7${'─'.repeat(60)}`);
logger.log(fails === 0
    ? `&C2✔ ALL GREEN &C7: ${passes} passed, ${fails} failed, in ${suites.length} suites`
    : `&C1✖ FAILURES &C7: ${passes} passed, ${fails} failed, in ${suites.length} suites`);

process.exitCode = fails > 0 ? 1 : 0;

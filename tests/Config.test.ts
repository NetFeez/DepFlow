/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Regression tests for the schema-backed config store and the schema write policy.
 * @license Apache-2.0
 */
import TestSuite from '@TestSuite/TestSuite.js';
import { File, Path } from '@netfeez/common-node';

import Config from '../src/config/Config.js';
import JsonSchema from '../src/config/JsonSchema.js';
import schema from '../src/schema/schema.js';
import { createTemp, removeTemp } from './utils.js';

const suite = new TestSuite('config store');

suite.add('round-trips a JSON config', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({
            dependencies: [{ name: 'alpha', repo: 'https://github.com/netfeez/alpha.git' }]
        }));
        const config = await Config.load(file);
        await config.save();

        const loaded = await Config.load(file);
        context.expect(loaded.data.dependencies.length).equals(1);
        context.expect(loaded.data.dependencies[0].name).equals('alpha');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('round-trips a YAML config', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.yaml');
        const config = await Config.load(file);
        config.data.importmap = 'public/importmap.json';
        config.data.outDir = 'dist';
        await config.save();

        const loaded = await Config.load(file);
        context.expect(loaded.data.importmap).equals('public/importmap.json');
        context.expect(loaded.data.outDir).equals('dist');
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('refreshes the editor json schema on save', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        const config = await Config.load(file);
        await config.save();

        const schemaPath = Path.join(dir, '.depflow', 'schema.json');
        context.expect(await File.exists(schemaPath)).ok();
        const content = await File.read(schemaPath);
        context.expect(content).equals(JSON.stringify(schema.Config.jsonSchema));
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('does not include the legacy flowFolder key', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        const config = await Config.load(file);
        context.expect('flowFolder' in config.data).notOk();
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('rejects a config carrying the legacy flowFolder key', async (context) => {
    const dir = await createTemp();
    try {
        const file = Path.join(dir, 'depflow.json');
        await File.write(file, JSON.stringify({ flowFolder: '.depflow' }));
        try {
            await Config.load(file);
            context.fail('expected the load to reject the legacy flowFolder key');
        } catch (error) {
            context.expect((error as Error).message.includes('flowFolder')).ok();
        }
        context.done();
    } finally { await removeTemp(dir); }
});

suite.add('anchors the editor json schema under the project root', async (context) => {
    const dir = await createTemp();
    try {
        await JsonSchema.write(dir);
        const schemaPath = Path.join(dir, '.depflow', 'schema.json');
        context.expect(await File.exists(schemaPath)).ok();
        const content = await File.read(schemaPath);
        context.expect(content).equals(JSON.stringify(schema.Config.jsonSchema));
        context.done();
    } finally { await removeTemp(dir); }
});

export default suite;
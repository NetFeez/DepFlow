/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility to help with File operations.
 * @license Apache-2.0
 */

import { promises as FS } from 'fs';
import schemas from './schemas.js';

export class Config {
    static async load(path: string): Promise<Config.Config> {
        const content = await FS.readFile(path, 'utf-8');
        const json = JSON.parse(content);
        const config = schemas.config.processData(json);
        return config;
    }
    static async save(path: string, config: Config.ConfigToProcess): Promise<void> {
        const content = JSON.stringify(config, null, 2);
        await FS.writeFile(path, content, 'utf-8');
    }
}
export namespace Config {
    export type Config = typeof schemas.config.infer;
    export type ConfigToProcess = typeof schemas.config.inferToProcess;
}

export default Config;
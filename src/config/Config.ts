/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Utility to help with File operations.
 * @license Apache-2.0
 */
import { File } from '@netfeez/common-node';

import Schemas from './schemas.js';

export class Config {
    /**
     * Loads the configuration from a file at the specified path.
     * If the file does not exist, it creates a new configuration file with default values and returns those defaults.
     * If the file exists, it reads the content, parses it as JSON, and processes it using the defined schema to ensure it conforms to the expected structure.
     * This method is essential for managing application settings or other relevant information in a structured format that can be easily read and modified as needed.
     * @param path The file system path of the configuration file to load.
     * @returns A promise that resolves to the loaded configuration object, which conforms to the expected structure defined in the Config.Config type.
     * @throws Will throw an error if there is an issue during the file reading or writing process, such as insufficient permissions or invalid path.
     */
    static async load(path: string): Promise<Config.Config> {
        if (!await File.exists(path)) {
            const defaults = Schemas.Config.processData({});
            await Config.save(path, defaults);
            return defaults;
        } else {
            const content = await File.read(path, 'utf-8');
            const json = JSON.parse(content);
            const config = Schemas.Config.processData(json);
            return config;
        }
    }
    /**
     * Saves the provided configuration object to a file at the specified path.
     * It converts the configuration object into a JSON string with proper formatting and writes it to the file using the File.write method.
     * This function is essential for persisting configuration data, allowing applications to store settings or other relevant information in a structured format that can be easily read and modified as needed.
     * @param path The file system path where the configuration should be saved.
     * @param config The configuration object to be saved, which should conform to the expected structure defined in the Config.ConfigToProcess type.
     * @returns A promise that resolves when the save operation is complete.
     * @throws Will throw an error if there is an issue during the file writing process, such as insufficient permissions or invalid path.
     */
    static async save(path: string, config: Config.ConfigToProcess): Promise<void> {
        const content = JSON.stringify(config, null, 2);
        await File.write(path, content, 'utf-8');
    }
}
export namespace Config {
    export type Config = typeof Schemas.Config.infer;
    export type ConfigToProcess = typeof Schemas.Config.inferToProcess;
}

export default Config;
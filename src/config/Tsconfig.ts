import File from "../support/File.js";
import schemas from "./schemas.js";

export class Tsconfig {
    /**
     * Loads and validates a tsconfig.json file against the basicTsconfig schema.
     * @param path - The path to the tsconfig.json file.
     * @returns A promise that resolves to the validated tsconfig object.
     * @throws An error if the file cannot be read, parsed, or does not conform to the schema.
     */
    public static async load(path: string): Promise<Tsconfig.Tsconfig> {
        if (!await File.exists(path)) {
            const defaults = schemas.basicTsconfig.processData({});
            await File.write(path, JSON.stringify(defaults, null, 2), 'utf-8');
            return defaults;
        } else {
            const content = await File.read(path, 'utf-8');
            const json = JSON.parse(content);
            const tsconfig = schemas.basicTsconfig.processData(json);
            return tsconfig;
        }
    }
}
export namespace Tsconfig {
    export type Tsconfig = schemas.basicTsconfig['infer'];
}
export default Tsconfig;
import File from "./File.js";
import schemas from "./schemas.js";

export class Tsconfig {
    /**
     * Loads and validates a tsconfig.json file against the basicTsconfig schema.
     * @param path - The path to the tsconfig.json file.
     * @returns A promise that resolves to the validated tsconfig object.
     * @throws An error if the file cannot be read, parsed, or does not conform to the schema.
     */
    public static async load(path: string): Promise<Tsconfig.Tsconfig> {
        const content = await File.read(path);
        const json = JSON.parse(content);
        return schemas.basicTsconfig.processData(json);
    }
}
export namespace Tsconfig {
    export type Tsconfig = schemas.basicTsconfig['infer'];
}
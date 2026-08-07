import { File, Path } from '@netfeez/common-node';

import type Grouper from '@netfeez/vterm/logger/Grouper';

export class Utils {
    protected static REPO_REGEX = /^(?:https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?|git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?)$/;
    public static newGroup(color: `#${string}` | number): Grouper.Group {
        let code = '';
        if (typeof color === 'number') {
            code = color >= 1 && color <= 7 ? `C${color}` : 'R';
        } else if (typeof color === 'string' && /^#([0-9A-Fa-f]{6})$/.test(color)) {
            code = `C(${color})`;
        } else { code = 'R'; }
        return { open: `&N&${code}╭─`, item: `&N&${code}│ `, line: `&N&${code}├─`, stop: `&N&${code}╰─` };
    }
    /**
     * Extracts a repository name from its URL.
     * @param repo - The repository URL.
     * @returns The repository name.
     */
    public static getRepoName = (repo: string): string => {
        const match = repo.match(Utils.REPO_REGEX);
        if (match) {
            const user = match[1] || match[3];
            const repoName = match[2] || match[4];
            return `${user}.${repoName}`;
        }
        
        throw new Error(`Invalid repository URL: "${repo}"`);
    };
    /**
     * Extracts the value(s) of a specified flag from an array of command-line arguments.
     * @param args - The array of command-line arguments.
     * @param flag - The flag to search for (e.g., '-p' or '--project').
     * @param multiple - Whether to allow multiple values for the same flag.
     * @returns An array of values associated with the specified flag.
     */
    public static getFlagValue(args: string[], flag: string, multiple: boolean = false): string[] {
        const values: string[] = [];
        for (const index in args) {
            const value = args[index];
            if (value === flag) {
                const nextValue = args[Number(index) + 1];
                if (nextValue && !nextValue.startsWith('-')) {
                    values.push(nextValue);
                    if (!multiple) break;
                }
            }
        }
        return values;
    }
    /**
     * Adds JSON schema validation for a specified file in Visual Studio Code by creating or updating the settings.json file in the .vscode directory.
     * It ensures that the provided schema object is saved locally and referenced correctly in the VSCode settings, allowing for enhanced editing support such as autocompletion and validation based on the defined schema when working with the specified file.
     * @param flowPath The file path to which the JSON schema validation should be applied (e.g., 'depflow.json').
     * @param schemaObject The JSON schema object that defines the structure and validation rules for the specified file.
     * @returns A promise that resolves to true if the operation was successful, or false if an error occurred during the process.
     */
    public static async addVscodeValidation(flowPath: string, schemaObject: object) {
        const root = process.cwd();
        const internalDir = Path.join(root, '.depflow');
        const schemaLocalPath = Path.join(internalDir, 'schema.json');
        const vscodeDir = Path.join(root, '.vscode');
        const settingsPath = Path.join(vscodeDir, 'settings.json');

        try {
            if (!await File.exists(internalDir)) await File.mkdir(internalDir, { recursive: true });
            await File.write(schemaLocalPath, JSON.stringify(schemaObject, null, 4));

            if (!await File.exists(vscodeDir)) await File.mkdir(vscodeDir, { recursive: true });

            let settings: any = {};
            if (await File.exists(settingsPath)) {
                try { settings = JSON.parse(await File.read(settingsPath)); }
                catch (e) { settings = {}; }
            }

            if (!settings['json.schemas']) settings['json.schemas'] = [];

            const relativeSchema = './.depflow/schema.json';
            const hasSchema = settings['json.schemas'].some((s: any) => s.fileMatch && s.fileMatch.includes(flowPath));
            if (hasSchema) return true;

            settings['json.schemas'].push({ fileMatch: [flowPath], url: relativeSchema });

            await File.write(settingsPath, JSON.stringify(settings, null, 4));
            return true;
        } catch (error) { return false; }
    }
    public static debounce<Args extends any[]>(
        fn: Utils.DebouncedFunction<Args>,
        delay: number
    ): Utils.DebouncedFunction<Args> {
        let timeoutId: NodeJS.Timeout | null = null;

        return function(this: any, ...args: Args) {
            if (timeoutId) clearTimeout(timeoutId);
            
            timeoutId = setTimeout(() => {
                fn.apply(this, args);
                timeoutId = null;
            }, delay);
        };
    }
    public static extractFlags(args: string[]): Utils.FlagResult {
        const purifiedArgs: string[] = [];
        const flags: Utils.FlagMap = {};

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (!arg.startsWith('-')) {
                purifiedArgs.push(arg);
                continue;
            }

            let [key, value] = arg.split('=');

            if (value !== undefined) {
                if (!flags[key]) flags[key] = [];
                flags[key].push(value);
                continue;
            }

            const nextArg = args[i + 1];
            if (nextArg && !nextArg.startsWith('-')) {
                if (!flags[key]) flags[key] = [];
                flags[key].push(nextArg);
                i++;
            } else {
                if (!flags[key]) flags[key] = [];
            }
        }

        return { args: purifiedArgs, flags };
    }
}
export namespace Utils {
    export interface FlagMap {
        [flag: string]: string[];
    }
    export interface FlagResult {
        args: string[];
        flags: FlagMap;
    }
    export type DebouncedFunction<Args extends any[]> = (...args: Args) => void;
}
export default Utils;
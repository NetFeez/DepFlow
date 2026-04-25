export class Utils {
    /**
     * Extracts a repository name from its URL.
     * @param repo - The repository URL.
     * @returns The repository name.
     */
    public static getRepoName = (repo: string) => {
        const match = repo.match(/(?:^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\.git)?$)(?:^git@github\.com:([^/]+)\/([^/]+)(?:\.git)?$)/);
        if (match) {
            const user = match[1] || match[3];
            const repoName = match[2] || match[4];
            return `${user}.${repoName}`;
        } else throw new Error(`Invalid repository URL: "${repo}"`);
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
}
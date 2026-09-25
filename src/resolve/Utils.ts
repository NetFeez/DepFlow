/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Static utilities for alias strings: wildcard detection and suffix removal.
 * @license Apache-2.0
 */
export class Utils {
    public static readonly WILDCARD_SUFFIX_REGEX = /\/\*?$/;
    /**
     * Checks if a given alias string ends with a wildcard suffix (either "/*" or "/"), indicating that it is a wildcard alias.
     * This method is used to determine whether an alias should be treated as a wildcard mapping, which allows for matching multiple paths under the same base alias.
     * @param alias - The alias string to check (e.g., "components/*" or "utils/").
     * @returns True if the alias ends with a wildcard suffix, false otherwise.
     */
    public static isWildcard(alias: string): boolean {
        return this.WILDCARD_SUFFIX_REGEX.test(alias);
    }
    /**
     * Removes the wildcard suffix (either "/*" or "/") from a given alias string, returning the base alias without the wildcard.
     * This is useful for normalizing aliases when processing them, allowing the resolver to work with a consistent format regardless of whether the original alias was defined as a wildcard or not.
     * @param pathStr - The alias string from which to remove the wildcard suffix (e.g., "components/*" or "utils/").
     * @returns The alias string with the wildcard suffix removed (e.g., "components" or "utils").
     */
    public static removeWildcardSuffix(pathStr: string): string {
        return pathStr.replace(this.WILDCARD_SUFFIX_REGEX, '');
    }
}
export namespace Utils {
    
}
export default Utils;
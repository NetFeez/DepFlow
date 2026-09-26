/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Compiles resolver entries from the configuration into absolute compiled aliases.
 * @license Apache-2.0
 */
import path from 'node:path';

import schema from '../schema/schema.js';

export class AliasCompiler {
    /** Matches the optional wildcard suffix of an alias or target (`/*` or `/`). */
    private static readonly WILDCARD_SUFFIX_REGEX = /\/\*?$/;

    constructor(private projectRoot: string) {}
    /**
     * Compiles alias configurations from the provided config object into a structured format for path resolution.
     * It processes both regular and wildcard aliases, resolving local paths to absolute paths based on the project root.
     * The resulting compiled aliases include information about the alias name, whether it's a wildcard, and its target paths for local and CDN usage.
     * @param config - The configuration object containing dependencies with resolver entries to compile into aliases.
     * @returns An array of compiled alias objects ready for use in path resolution.
     */
    public compile(config: schema.Config): AliasCompiler.CompiledAlias[] {
        const result: AliasCompiler.CompiledAlias[] = [];
        const allDeps = [
            ...(config.dependencies || []),
            ...(config.npmDependencies || [])
        ];
        const baseResolvers = config.resolver || {};
        for (const dep of allDeps) {
            if (typeof dep !== 'object' || !dep.resolver) continue;
            result.push(...this.resolve(dep.resolver));
        }
        result.push(...this.resolve(baseResolvers));
        return result;
    }
    /**
     * Resolves an array of resolver entries into compiled alias objects, handling both string and object target formats.
     * It determines if each alias is a wildcard and resolves local paths to absolute paths based on the project root.
     * The method also extracts type and CDN targets if provided in the resolver entry.
     * @param resolver - An array of resolver entries to process into compiled aliases.
     * @returns An array of compiled alias objects derived from the resolver entries.
     */
    protected resolve(resolver: AliasCompiler.Resolver): AliasCompiler.CompiledAlias[] {
        const result: AliasCompiler.CompiledAlias[] = [];
        for (const [crudeAlias, target] of Object.entries(resolver)) {
            const isWildcard = AliasCompiler.isWildcard(crudeAlias);
            const alias = AliasCompiler.removeWildcardSuffix(crudeAlias);

            const rawLocal = typeof target === 'string' ? target : target.local;
            const localTarget = path.isAbsolute(rawLocal) 
                ? AliasCompiler.removeWildcardSuffix(rawLocal)
                : path.resolve(this.projectRoot, AliasCompiler.removeWildcardSuffix(rawLocal));

            let cdnTarget: string | undefined;
            let typeTarget: string | undefined;
            if (typeof target === 'object') {
                if (target.type) {
                    typeTarget = AliasCompiler.removeWildcardSuffix(target.type);
                }
                if (target.cdn) {
                    cdnTarget = AliasCompiler.removeWildcardSuffix(target.cdn);
                }
            }
            result.push({ alias, isWildcard, targets: { local: localTarget, type: typeTarget, cdn: cdnTarget } });
        }
        return result;
    }

    /**
     * Checks whether an alias string carries the wildcard suffix (`/*` or `/`) that turns it into a mapping.
     * @param alias - The alias string to check.
     * @returns True if the alias ends with a wildcard suffix, false otherwise.
     */
    private static isWildcard(alias: string): boolean {
        return this.WILDCARD_SUFFIX_REGEX.test(alias);
    }

    /**
     * Strips the wildcard suffix from an alias or target string, leaving its base form.
     * @param pathStr - The string to normalize (e.g., `components/*` or `utils/`).
     * @returns The string without its wildcard suffix (e.g., `components` or `utils`).
     */
    private static removeWildcardSuffix(pathStr: string): string {
        return pathStr.replace(this.WILDCARD_SUFFIX_REGEX, '');
    }
}
export namespace AliasCompiler {
    export type Resolver = schema.Resolver;
    export type Target = Exclude<schema.Target, string>;
    export interface CompiledAlias {
        alias: string;
        targets: Target;
        isWildcard: boolean;
    }
}
export default AliasCompiler;
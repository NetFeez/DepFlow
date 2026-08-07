import path from 'node:path';

import Utils from './Utils.js';
import Config from '../../config/Config.js';
import schema from '../../schema/schema.js';

export class AliasCompiler {
    constructor(private projectRoot: string) {}
    /**
     * Compiles alias configurations from the provided config object into a structured format for path resolution.
     * It processes both regular and wildcard aliases, resolving local paths to absolute paths based on the project root.
     * The resulting compiled aliases include information about the alias name, whether it's a wildcard, and its target paths for local and CDN usage.
     * @param config The configuration object containing dependencies with resolver entries to compile into aliases.
     * @returns An array of compiled alias objects ready for use in path resolution.
     */
    public compile(config: Config.Config): AliasCompiler.CompiledAlias[] {
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
     * @param resolver An array of resolver entries to process into compiled aliases.
     * @returns An array of compiled alias objects derived from the resolver entries.
     */
    protected resolve(resolver: AliasCompiler.Resolver): AliasCompiler.CompiledAlias[] {
        const result: AliasCompiler.CompiledAlias[] = [];
        for (const [crudeAlias, target] of Object.entries(resolver)) {
            const isWildcard = Utils.isWildcard(crudeAlias);
            const alias = Utils.removeWildcardSuffix(crudeAlias);

            const rawLocal = typeof target === 'string' ? target : target.local;
            const localTarget = path.isAbsolute(rawLocal) 
                ? Utils.removeWildcardSuffix(rawLocal)
                : path.resolve(this.projectRoot, Utils.removeWildcardSuffix(rawLocal));

            let cdnTarget: string | undefined;
            let typeTarget: string | undefined;
            if (typeof target === 'object') {
                if (target.type) {
                    typeTarget = Utils.removeWildcardSuffix(target.type);
                }
                if (target.cdn) {
                    cdnTarget = Utils.removeWildcardSuffix(target.cdn);
                }
            }
            result.push({ alias, isWildcard, targets: { local: localTarget, type: typeTarget, cdn: cdnTarget } });
        }
        return result;
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
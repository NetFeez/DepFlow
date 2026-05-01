import path from 'node:path';

import Schemas from '../../config/schemas.js';
import Utils from './Utils.js';

export class AliasCompiler {
    constructor(private projectRoot: string) {}
    /**
     * Compiles alias configurations from the provided config object into a structured format for path resolution.
     * It processes both regular and wildcard aliases, resolving local paths to absolute paths based on the project root.
     * The resulting compiled aliases include information about the alias name, whether it's a wildcard, and its target paths for local and CDN usage.
     * @param config The configuration object containing dependencies with resolver entries to compile into aliases.
     * @returns An array of compiled alias objects ready for use in path resolution.
     */
    public compile(config: Schemas.Config['infer']): AliasCompiler.CompiledAlias[] {
        const result: AliasCompiler.CompiledAlias[] = [];
        const allDeps = [...(config.dependencies || []), ...(config.npmDependencies || [])];

        for (const dep of allDeps) {
            if (typeof dep !== 'object' || !dep.resolver) continue;

            for (const entry of dep.resolver) {
                const isWildcard = Utils.isWildcard(entry.alias);
                const alias = Utils.removeWildcardSuffix(entry.alias);

                const rawLocal = typeof entry.target === 'string' ? entry.target : entry.target.local;
                const localTarget = path.isAbsolute(rawLocal) 
                    ? Utils.removeWildcardSuffix(rawLocal)
                    : path.resolve(this.projectRoot, Utils.removeWildcardSuffix(rawLocal));

                let cdnTarget: string | undefined;
                let typeTarget: string | undefined;
                if (typeof entry.target === 'object') {
                    if (entry.target.type) {
                        typeTarget = Utils.removeWildcardSuffix(entry.target.type);
                    }
                    if (entry.target.cdn) {
                        cdnTarget = Utils.removeWildcardSuffix(entry.target.cdn);
                    }
                }

                result.push({ alias, isWildcard, targets: { local: localTarget, type: typeTarget, cdn: cdnTarget } });
            }
        }
        return result;
    }
}
export namespace AliasCompiler {
    export interface Target {
        local: string;
        type?: string;
        cdn?: string;
    }
    export interface CompiledAlias {
        alias: string;
        targets: Target;
        isWildcard: boolean;
    }
}
export default AliasCompiler;
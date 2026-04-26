import path from 'node:path';

import schemas from '../../config/schemas.js';
import Utils from './Utils.js';

export class AliasCompiler {
    constructor(private projectRoot: string) {}

    public compile(config: schemas.config['infer']): AliasCompiler.CompiledAlias[] {
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
                if (typeof entry.target === 'object' && entry.target.cdn) {
                    cdnTarget = Utils.removeWildcardSuffix(entry.target.cdn);
                }

                result.push({ alias, isWildcard, targets: { local: localTarget, cdn: cdnTarget } });
            }
        }
        return result;
    }
}
export namespace AliasCompiler {
    export interface Target {
        local: string;
        cdn?: string;
    }
    export interface CompiledAlias {
        alias: string;
        targets: Target;
        isWildcard: boolean;
    }
}
export default AliasCompiler;
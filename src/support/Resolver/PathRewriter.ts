import path from "node:path";
import { Utilities } from "vortez";
import AliasCompiler from "./AliasCompiler.js";

export class PathRewriter {
    public static readonly IMPORT_REGEX = /(from\s+['"])([^'"]+)(['"])/g;
    constructor(
        private readonly aliases: AliasCompiler.CompiledAlias[],
        private readonly projectRoot: string
    ) {}

    public rewrite(content: string, filePath: string, mode: 'local' | 'cdn'): string {
        return content.replace(PathRewriter.IMPORT_REGEX, (match, prefix, modulePath, suffix) => {
            const aliasCfg = this.aliases.find(c => c.isWildcard ? modulePath.startsWith(`${c.alias}/`) : modulePath === c.alias);

            if (!aliasCfg) return match;

            const isCDN = mode === 'cdn' && aliasCfg.targets.cdn;
            const baseTarget = isCDN ? aliasCfg.targets.cdn! : aliasCfg.targets.local;

            let resolvedPath: string;
            if (aliasCfg.isWildcard) {
                const subPath = modulePath.substring(aliasCfg.alias.length + 1);
                resolvedPath = isCDN 
                    ? `${baseTarget.replace(/\/$/, '')}/${subPath}`
                    : path.join(baseTarget, subPath);
            } else {
                resolvedPath = baseTarget;
            }

            if (isCDN) return `${prefix}${resolvedPath}${suffix}`;

            const currentFileDir = path.dirname(filePath);
            let relativeTarget = path.relative(currentFileDir, resolvedPath);
            if (!relativeTarget.startsWith('.')) relativeTarget = `./${relativeTarget}`;
            
            return `${prefix}${Utilities.Path.normalize(relativeTarget)}${suffix}`;
        });
    }
}
export namespace PathRewriter {}
export default PathRewriter;
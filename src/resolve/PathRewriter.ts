/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Rewrites import statements in file content using compiled aliases.
 * @license Apache-2.0
 */
import PATH from "node:path";

import AliasCompiler from "./AliasCompiler.js";

export class PathRewriter {
    public static readonly IMPORT_REGEX = /(from\s+['"])([^'"]+)(['"])/g;
    constructor(
        private readonly aliases: AliasCompiler.CompiledAlias[]
    ) {}
    /**
     * Rewrites import paths in the given content based on the configured aliases.
     * It detects import statements and replaces alias paths with their resolved targets.
     * @param content - The file content to rewrite.
     * @param filePath - The path of the file being processed (used for relative path calculations).
     * @param mode - The resolution mode ('local' or 'cdn') to determine which target to use.
     * @returns The rewritten content with resolved import paths.
     */
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
                    : PATH.join(baseTarget, subPath);
            } else {
                resolvedPath = baseTarget;
            }

            if (isCDN) return `${prefix}${resolvedPath}${suffix}`;

            const currentFileDir = PATH.dirname(filePath);
            const relative = PATH.relative(currentFileDir, resolvedPath);
            const relativeTarget = relative.startsWith('.') ? relative : `./${relative}`;

            return `${prefix}${PathRewriter.posix(relativeTarget)}${suffix}`;
        });
    }
    /**
     * The specifier of an import, which is never a file system path: the separator it is written with
     * is the one of the module system, not the one of the machine that wrote it.
     * @param target - The target of the import, as the file system spells it.
     * @returns The target written with the separator an import is written with.
     **/
    protected static posix(target: string): string {
        return target.split(PATH.sep).join('/');
    }
}
export namespace PathRewriter {}
export default PathRewriter;
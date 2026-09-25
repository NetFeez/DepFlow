/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Base contract for installable dependencies with their build pipeline and resolver.
 * @license Apache-2.0
 */
import type Logger from "@netfeez/vterm";

import schema from "../schema/schema.js";
import type AliasCompiler from "../resolve/AliasCompiler.js";

export abstract class Dependency {
    protected readonly logger: Logger | null;

    public readonly name: string;
    public readonly builder: schema.Builder;
    public readonly resolver: AliasCompiler.Resolver;

    public constructor(info: Dependency.Info, logger?: Logger | null) {
        this.name = info.name;
        this.builder = info.builder || [];
        this.resolver = info.resolver || {};
        this.logger = logger || null;
    }
    /**
     * Install the dependency.
     * This method should handle the installation process, such as downloading files, setting up configurations, etc.
     */
    public abstract install(): Promise<void>;
    /**
     * Uninstall the dependency.
     * This method should handle the uninstallation process, such as removing files, cleaning up configurations, etc.
     */
    public abstract uninstall(): Promise<void>;
    /**
     * Build the dependency.
     * This method should handle the build process, such as compiling code, bundling files, etc.
     */
    public abstract build(): Promise<void>;
}
export namespace Dependency {
    export interface Info {
        name: string;
        builder?: schema.Builder;
        resolver?: AliasCompiler.Resolver;
    }
}
export default Dependency;
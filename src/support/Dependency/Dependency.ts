import type Logger from "@netfeez/vterm";

import type AliasCompiler from "../PathResolver/AliasCompiler.js";
import type Builder from "../Builder/Builder.js";

export abstract class Dependency {
    protected readonly logger: Logger | null;

    public readonly name: string;
    public readonly builder: Builder.Builder;
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
    /**
     * Resolve the dependency.
     * This method should handle the resolution process, such as fetching dependencies, resolving versions, etc.
     */
    public abstract resolve(): Promise<void>;
}
export namespace Dependency {
    export interface Info {
        name: string;
        builder?: Builder.Builder;
        resolver?: AliasCompiler.Resolver;
    }
}
export default Dependency;
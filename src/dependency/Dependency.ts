/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Base contract for installable dependencies with their build pipeline and resolver.
 * @license Apache-2.0
 */
import { Path } from "@netfeez/common-node";
import type Logger from "@netfeez/vterm";

import schema from "../schema/schema.js";
import type AliasCompiler from "../resolve/AliasCompiler.js";

export abstract class Dependency {
    /**
     * The deadline every acquisition of a source runs under, in milliseconds. Acquisition is bounded so a
     * repository that never answers is reported instead of waiting forever.
     *
     * @remarks It is not the deadline of a build step, which is the one the schema declares: a clone or an
     * install of a large source legitimately takes longer than a build step, and cutting it at the build
     * deadline would report a failure for work that is still on its way.
     */
    public static readonly ACQUISITION_TIME_MS: number = 300000;

    protected readonly logger: Logger | null;

    public readonly name: string;
    public readonly builder: schema.Builder;
    public readonly resolver: AliasCompiler.Resolver;

    public constructor(
        public readonly flowFolder: string,
        info: Dependency.Info,
        logger?: Logger | null
    ) {
        this.name = info.name;
        this.builder = info.builder || [];
        this.resolver = info.resolver || {};
        this.logger = logger || null;
    }
    /**
     * Resolves a folder of the dependency, relative to the flow folder, and guarantees it stays inside it.
     * @param segments - The path of the folder inside the flow folder.
     * @returns The normalized path of the folder.
     * @throws { Error } When the segments escape the flow folder.
     *
     * @remarks A name is an identity, never a path: the schema rejects the ones that are not a single
     * segment, and this is where the ones that reach a dependency any other way are stopped, before
     * anything is cloned into them or removed from them.
     */
    protected resolve(...segments: string[]): string {
        const root = Path.normalize(this.flowFolder);
        const folder = Path.normalize(Path.join(root, ...segments));
        if (!Path.isInside(root, folder)) throw new Error(`Dependency "${this.name}" resolves outside of the flow folder: ${folder}`);
        return folder;
    }
    /**
     * Whether the dependency is installed, which is the folder of its files being in place.
     * @returns A promise resolving to `true` when the files of the dependency are there.
     */
    public abstract isInstalled(): Promise<boolean>;
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

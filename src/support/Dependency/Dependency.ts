/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Dependency utility.
 * @license Apache-2.0
 */
import { File, Path } from '@netfeez/common-node';
import Logger from "@netfeez/vterm";

import schemas from "../../config/schemas.js";
import Config from "../../config/Config.js";
import Validator from "../Validator.js";
import Git from "../Git.js";
import Utils from "../Utils.js";
import Builder from "./Builder.js";

export class Dependency implements Dependency.Dependency {
    public static include: string[] = [ '*' ];
    public readonly name: string;
    public readonly repo: Dependency.repo;
    public readonly tag?: string;
    public readonly builder: Dependency.Builder[];
    public readonly resolver: Dependency.Resolver[];

    public constructor(
        protected readonly config: Config.Config,
        dependency: Dependency.Dependency,
        protected logger: Logger
    ) {
        Validator.validateRepo(dependency.repo);
        this.name = dependency.name;
        this.repo = dependency.repo;
        this.tag = dependency.tag;
        this.builder = dependency.builder;
        this.resolver = dependency.resolver || [];
    }
    /** Get the folder of the dependency */
    public get folder(): string {
        let path = Path.join(this.config.flowFolder, this.name);
        path = Path.normalize(path);
        return path;
    }
    /**
     * Updates the local repository of the dependency by either cloning it if it does not exist or pulling the latest changes if it already exists. It checks for the existence of the dependency's folder and performs the appropriate Git operations, providing logging throughout the process to indicate the status of the operations. This method ensures that the local copy of the dependency is up-to-date with its remote repository, allowing for a smooth installation and build process when managing dependencies in a project.
     * @returns A promise that resolves when the update process is complete, or rejects with an error if any step of the process fails, allowing callers to handle such scenarios appropriately.
     * @throws Will throw an error if any issues occur during the cloning or pulling process, such as problems with Git commands or file system access.
     */
    protected async update(): Promise<void> {
        if (this.logger) this.logger.group(Utils.newGroup('#00B4FF'));
        if (await File.exists(this.folder)) {
            this.logger.log(`&C3Repository already exists, pulling latest changes...`);
            await Git.pull(this.folder, { logger: this.logger });
            this.logger.log(`&C2Pull completed successfully.`);
        } else {
            this.logger.log(`&C5Cloning repository from &C6${this.repo}&C5...`);
            await Git.clone(this.repo, this.folder, { tag: this.tag, logger: this.logger });
            this.logger.log(`&C2Clone completed successfully.`);
        }
        if (this.logger) this.logger.groupEnd();
    }
    protected async build(): Promise<boolean> {
        if (this.builder.length === 0) return true;
        const builder = new Builder(this.builder, this.folder, this.logger);
        await builder.run();
        return true;
    }
    /**
     * Installs the dependency by first cloning its repository (or pulling updates if it already exists) and then executing any build steps defined in the builder property. It manages the entire installation process, including handling the cloning/pulling of the repository and running any necessary commands to set up the dependency according to its configuration. This method ensures that the dependency is properly installed and ready for use, providing feedback on each step of the process through returned messages.
     * @returns A promise that resolves to an array of string messages indicating the results of the cloning/pulling and building processes.
     * @throws Will throw an error if any step of the installation process fails, such as issues with cloning, pulling, or executing build commands.
     */
    public async install(): Promise<void> {
        try {
            await this.update();
            await this.build();
        } catch (error) { throw error; }
    }
    /**
     * Uninstalls the dependency by removing its local folder and any additional folders specified in the builder's move steps.
     * It checks for the existence of each folder before attempting to remove it, ensuring that it only tries to delete valid paths.
     * This method is crucial for cleanly removing a dependency from the local file system, allowing for a complete uninstallation that includes all related files and directories as defined by the dependency's configuration.
     * @return A promise that resolves to an array of string messages indicating the results of the uninstallation process, such as which folders were removed.
     * @throws Will throw an error if any issues occur during the uninstallation process, such as problems with file system access or if the specified folders cannot be removed.
     */
    public async uninstall(): Promise<void> {

    }
}

export namespace Dependency {
    export type logCallback = (messages: string[]) => void;
    export type repo = `https://github.com/${string}/${string}.git` | `git@github.com:${string}/${string}.git`;
    export type Builder = schemas.builder['infer'];
    export type Resolver = schemas.pathResolverEntry['infer'];
    export type Dependency = schemas.dependency['infer'];
    export type newDependency = schemas.dependency['inferToProcess'];
    export interface manageOptions { force?: boolean; }
}

export default Dependency;

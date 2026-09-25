/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Dependency utility.
 * @license Apache-2.0
 */
import { File, Path } from '@netfeez/common-node';
import Logger from "@netfeez/vterm";

import Validator from "./Validator.js";
import Git from "./Git.js";
import Group from "../task/Group.js";
import Dependency from './Dependency.js';
import Builder from '../builder/Builder.js';
import schema from '../schema/schema.js';

export class GitDependency extends Dependency implements GitDependency.Data {
    public readonly repo: GitDependency.repo;
    public readonly tag: string;

    public constructor(
        public readonly flowFolder: string,
        dependency: GitDependency.Data,
        logger: Logger | null = null
    ) { super({
            name: dependency.name,
            builder: dependency.builder,
            resolver: dependency.resolver || {}
        }, logger);
        Validator.validateRepo(dependency.repo);
        this.repo = dependency.repo;
        this.tag = dependency.tag;
    }
    /** Get the folder of the dependency */
    public get folder(): string {
        let path = Path.join(this.flowFolder, this.name);
        path = Path.normalize(path);
        return path;
    }
    public async install(): Promise<void> {
        this.logger?.group(Group.newGroup('#00B4FF'));
        if (await File.exists(this.folder)) {
            this.logger?.log(`&C3Repository already exists, pulling latest changes...`);
            await Git.pull(this.folder, { logger: this.logger ?? undefined });
            this.logger?.log(`&C2Pull completed successfully.`);
        } else {
            this.logger?.log(`&C5Cloning repository from &C6${this.repo}&C5...`);
            await Git.clone(this.repo, this.folder, { tag: this.tag, logger: this.logger ?? undefined });
            this.logger?.log(`&C2Clone completed successfully.`);
        }
        await this.build();
        this.logger?.groupEnd();
    }
    /** Removes the local clone from the flow folder, if present. **/
    public async uninstall(): Promise<void> {
        if (!await File.exists(this.folder)) return void this.logger?.log(`&C4No installation found for &C6${this.name}&C4, skipping.`);
        this.logger?.log(`&C1Removing &C6${this.name}&C1 from &C4${this.folder}&C1...`);
        await File.remove(this.folder);
    }
    public async build(): Promise<void> {
        if (this.builder.length === 0) return;
        const builder = new Builder({
            pipeline: this.builder,
            cwd: this.folder,
            logger: this.logger
        });
        await builder.run();
    }
}

export namespace GitDependency {
    export type repo = `https://github.com/${string}/${string}.git` | `git@github.com:${string}/${string}.git`;
    export type Data = schema.Dependency.GitDependency;
}

export default GitDependency;

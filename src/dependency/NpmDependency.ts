/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description NPM dependency: installs a package and builds it with the configured pipeline.
 * @license Apache-2.0
 */
import { File } from "@netfeez/common-node";
import Logger from "@netfeez/vterm";

import Builder from "../builder/Builder.js";
import Task from "../task/Task.js";
import Group from "../task/Group.js";
import type OutputPolicy from "../task/OutputPolicy.js";
import { Dependency } from "./Dependency.js";
import schema from "../schema/schema.js";

export class NpmDependency extends Dependency implements NpmDependency.Data {
    public version: string;

    public constructor(
        flowFolder: string,
        projectRoot: string,
        dependency: NpmDependency.Data,
        logger: Logger | null = null,
        policy: OutputPolicy | null = null
    ) {
        super(flowFolder, projectRoot, {
            name: dependency.name,
            builder: dependency.builder,
            resolver: dependency.resolver || {}
        }, logger, policy);
        this.version = dependency.version;
    }

    /** The folder of the package, the identity of the dependency inside the flow folder. **/
    public get folder(): string { return this.resolve('node_modules', this.name); }

    /** Whether the package is installed in the flow folder. **/
    public async isInstalled(): Promise<boolean> { return File.exists(this.folder); }

    /**
     * Installs the package and builds it with the pipeline of the dependency.
     *
     * @remarks The group of the acquisition is opened only when the run decorates its output, and it is
     * closed in a `finally` so an installation that throws leaves the output as closed as one that
     * succeeded: a box left open is a box every line after it is drawn inside.
     */
    public async install(): Promise<void> {
        const boxed = this.policy === null || this.policy.decoration === 'on';
        if (boxed) this.logger?.group(Group.create('#00B4FF'));
        try {
            this.logger?.log(`&C5Using npm to install &C6${this.name}&C5...`);

            const identity: OutputPolicy.Identity = { step: null };
            const task = new Task(this.flowFolder, [
                { executable: 'npm', args: [ 'install', `${this.name}@${this.version}`, '--prefix', './', '--no-save' ], cwd: this.flowFolder }
            ], { maxTimeMs: Dependency.ACQUISITION_TIME_MS });

            if (this.policy) {
                task.on('line', (line, ordinal) => this.policy?.live(identity, line, ordinal, 'stdout'));
                task.on('err', (line, ordinal) => this.policy?.live(identity, line, ordinal, 'stderr'));
                task.once('finish', (data) => this.policy?.settleTask(identity, data));

                try { await task.run(); }
                catch (failure) {
                    if (failure instanceof Task.Failure) this.policy.stepFailed(identity, failure);
                    throw failure;
                }
            } else {
                if (this.logger) {
                    task.on('line', (line) => this.logger?.log(`&C3${line}`));
                    task.on('err', (line) => this.logger?.error(`&C1${line}`));
                }
                await task.run();
            }

            this.logger?.log(`&C2Installation of ${this.name} completed successfully.`);

            await this.build();
        } finally {
            if (boxed) this.logger?.end();
        }
    }
    /** Removes the installed npm package folder, if present. **/
    public async uninstall(): Promise<void> {
        if (!await this.isInstalled()) return void this.logger?.log(`&C4No installation found for &C6${this.name}&C4, skipping.`);
        this.logger?.log(`&C1Removing &C6${this.name}&C1 from &C4${this.folder}&C1...`);
        await File.remove(this.folder);
    }
    public async build(): Promise<void> {
        if (this.builder.length === 0) return;
        const builder = new Builder({
            pipeline: this.builder,
            cwd: this.folder,
            projectRoot: this.projectRoot,
            logger: this.logger,
            policy: this.policy
        });
        await builder.run();
    }
}
export namespace NpmDependency {
    export type Data = schema.Dependency.NpmDependency;
}
export default NpmDependency;
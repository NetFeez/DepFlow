import { Path } from "@netfeez/common-node";
import Builder from "../Builder/Builder.js";
import Task from "../Task/Task.js";
import Utils from "../Utils.js";
import { Dependency } from "./Dependency.js";
import Logger from "@netfeez/vterm";
import Async from "@netfeez/common-node/Async.js";
import schema from "../../schema/schema.js";

export class NpmDependency extends Dependency implements NpmDependency.Dependency {
    public version: string;
    
    public constructor(
        public readonly flowFolder: string,
        dependency: NpmDependency.Dependency,
        logger: Logger | null = null
    ) {
        super({
            name: dependency.name,
            builder: dependency.builder,
            resolver: dependency.resolver || []
        }, logger);
        this.version = dependency.version;
    }

    public get folder(): string {
        let path = Path.join(this.flowFolder, 'node_modules', this.name);
        path = Path.normalize(path);
        return path;
    }

    public async install(): Promise<void> {
        try {
            this.logger?.group(Utils.newGroup('#00B4FF'));
            this.logger?.log(`&C5Using npm to install &C6${this.name}&C5...`);
            const identifier = `${this.name}@${this.version}`;
            const task = new Task(this.flowFolder, [
                `npm install ${identifier} --prefix ./ --no-save`
            ]);
            await Async.awaitEvent<void>((done, fail) => {
                if (this.logger) {
                    task.on('line', (data) => this.logger?.log(`&C3${data}`));
                    task.on('error', (data) => this.logger?.error(`&C1${data}`));
                }
                task.on('finish', () => {
                    this.logger?.log(`&C2Installation of ${this.name} completed successfully.`);
                    done();
                });
                task.start().catch(fail);
                return () => { task.stop(); };
            })
            await this.build();
            this.logger?.groupEnd();
        } catch (error) { throw error; }
    }
    public async uninstall(): Promise<void> {}
    public async build(): Promise<void> {
        if (this.builder.length === 0) return;
        const builder = new Builder({
            pipeline: this.builder,
            cwd: this.folder,
            logger: this.logger
        });
        await builder.run();
    }
    public async resolve(): Promise<void> {}

}
export namespace NpmDependency {
        export type Resolver = schema.Resolver;
        export type Dependency = schema.Dependency.NpmDependency;
}
export default NpmDependency;
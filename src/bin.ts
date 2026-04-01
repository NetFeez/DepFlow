#!/usr/bin/env node
/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Dependency Flow CLI.
 * @license Apache-2.0
 */

import { Utilities } from 'vortez'
import Dependency from './Dependency.js';
import File from './File.js';
import PathFixer from './PathFixer.js';
import Validator from './Validator.js';

const dependencyFile = 'dep.NetFeez-Labs.json';

/**
 * Extracts a repository name from its URL.
 * @param repo - The repository URL.
 * @returns The repository name.
 */
const getRepoName = (repo: string) => {
    const match = repo.match(/\/([^/]+\.git)$/);
    return match ? match[1].replace('.git', '') : null;
};
/**
 * Appends a value to an array or string.
 * @param current - The current value.
 * @param value - The value to append.
 */
function appendValue(current: string | string[] | undefined, value: string): string | string[] {
    if (!current) return value;
    if (typeof current === 'string') return [current, value];
    return [...current, value];
};

async function add(this: Utilities.DebugUI, command: string, args: string[]): Promise<void> {
    try {
        this.out.info(`&C(255,180,220)╭─────────────────────────────────────────────`);
        const [repo, name] = args;
        this.out.info(`&C(255,180,220)│ Adding dependency...`);
        Validator.validateRepo(repo);
        const dependencies = await File.load(dependencyFile);
        const dependencyName = name || getRepoName(repo);
        Validator.validateName(dependencyName);
     
        if (dependencies.some(dep => dep.name === dependencyName)) throw new Error(`A dependency with the name "${dependencyName}" already exists.`);
    
        const newDep: Dependency.Dependency = { name: dependencyName, repo };
        await File.save(dependencyFile, [...dependencies, newDep]);
        this.out.info(`&C(255,180,220)│ Added dependency "${dependencyName}".`);
    } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
    finally { this.out.info(`&C(255,180,220)╰─────────────────────────────────────────────`); }
}

async function remove(this: Utilities.DebugUI, command: string, args: string[]): Promise<void> {
    try {
        this.out.info(`&C(255,180,220)╭─────────────────────────────────────────────`);
        const [identifier] = args;
        if (!identifier) throw new Error('Usage: dep remove <name_or_repo_url>');
        const dependencies = await File.load(dependencyFile);
        const updatedDependencies = dependencies.filter(dep => dep.name !== identifier && dep.repo !== identifier);
        if (dependencies.length === updatedDependencies.length) throw new Error(`Dependency "${identifier}" not found.`);
        await File.save(dependencyFile, updatedDependencies);
        this.out.info(`&C(255,180,220)│ Removed dependency "${identifier}".`);
    } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
    finally { this.out.info(`&C(255,180,220)╰─────────────────────────────────────────────`); }
}

/* async function output(this: Utilities.DebugUI, command: string, args: string[]): Promise<void> {
    try {
        this.out.info(`&C(255,180,220)╭─────────────────────────────────────────────`);
        const [identifier, output, source] = args;
        if (!identifier || !output) throw new Error('Usage: dep output <name_or_repo_url> <output_path> [source_path]');
        const dependencies = await File.load(dependencyFile);
        const dependency = dependencies.find(dep => dep.name === identifier || dep.repo === identifier);
        if (!dependency) throw new Error(`Dependency "${identifier}" not found.`);
        
        let out = dependency.out;

        if (!out) out = source ? { [source]: output } : output;
        else if (typeof out === 'string') {
            if (!source) out = appendValue(out, output);
            else if (source === '/') out = { '/': appendValue(out, output) };
            else out = { [source]: output, '/': out };
        } else if (Array.isArray(out)) {
            if (!source) out = appendValue(out, output);
            else if (source === '/') out = { '/': appendValue(out, output) };
            else out = { [source]: output, '/': out };
        } else {
            const key = source || '/';
            out[key] = appendValue(out[key], output);
        }

        dependency.out = out;
        await File.save(dependencyFile, dependencies);
        this.out.info(`&C(255,180,220)│ Updated dependency output from &C4${identifier}`);
    } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
    finally { this.out.info(`&C(255,180,220)╰─────────────────────────────────────────────`); }
} */

async function install(this: Utilities.DebugUI, command: string, args: string[]): Promise<void> {
    try {
        this.out.info(`&C(255,180,220)╭─────────────────────────────────────────────`);
        const dependencies = await File.load(dependencyFile)
        const toInstall = args.length > 0
            ? dependencies.filter(dep => args.includes(dep.name) || args.includes(dep.repo))
            : dependencies;

        if (toInstall.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to install.');

        let isFirst = true;
        for (const data of toInstall) {
            if (!isFirst) this.out.info(`&C(255,180,220)│`); else isFirst = false;
            this.out.info(`&C(255,180,220)│ &C3Installing dependency: &C3${data.name}`);
            const dependency = new Dependency(data);
            const result = await dependency.install();
            this.out.info(`&C(255,180,220)│ ${result.join('\n').replace(/\n/g, '\n&C(255,180,220)│ ')}`);
            this.out.info(`&C(255,180,220)│ &C3Installed dependency: &C3${data.name}`);
        }
    } catch (error) { this.out.error(`&C(255,180,220)│ &C1${`${error}`.split('\n').join('\n&C(255,180,220)│   ')}`); }
    finally { this.out.info(`&C(255,180,220)╰─────────────────────────────────────────────`); }
}

async function uninstall(this: Utilities.DebugUI, command: string, args: string[]): Promise<void> {
    try {
        this.out.info(`&C(255,180,220)╭─────────────────────────────────────────────`);
        const dependencies = await File.load(dependencyFile);
        const toUninstall = args.length > 0
            ? dependencies.filter(dep => args.includes(dep.name) || args.includes(dep.repo))
            : dependencies;

        if (toUninstall.length === 0) throw new Error(args.length > 0 ? 'Specified dependencies not found.' : 'No dependencies to uninstall.');

        let isFirst = true;
        for (const data of toUninstall) {
            if (!isFirst) this.out.info(`&C(255,180,220)│`); else isFirst = false;
            this.out.info(`&C(255,180,220)│ &C3Uninstalling dependency: &C3${data.name}`);
            const dependency = new Dependency(data);
            const result = await dependency.uninstall();
            this.out.info(`&C(255,180,220)│ ${result.join('\n').replace(/\n/g, '\n&C(255,180,220)│ ')}`);
        }
    } catch (error) { this.out.error(`&C(255,180,220)│ &C1${error}`); }
    finally { this.out.info(`&C(255,180,220)╰─────────────────────────────────────────────`); }
}

async function list(this: Utilities.DebugUI): Promise<void> {
    const dependencies: Dependency.Dependency[] = await File.load(dependencyFile);
    if (dependencies.length === 0) {
        this.out.info('No dependencies found.');
        return;
    }
    this.out.info('&C(255,180,220)╭─────────────────────────────────────────────');
    this.out.info(`&C(255,180,220)│ &C3Dependencies:`);
    for (const dependency of dependencies) {
        this.out.info(`&C(255,180,220)│   - &C3${dependency.name}: &C2${dependency.repo}`);
    }
    this.out.info('&C(255,180,220)╰─────────────────────────────────────────────');
}

async function fixPaths(this: Utilities.DebugUI, command: string, args: string[]): Promise<void> {
    try {
        const watch = args.includes('--watch') || args.includes('-w');
        let projectPath = process.cwd();

        const projectFlagIndex = args.findIndex(arg => arg === '-p' || arg === '--project');

        if (projectFlagIndex !== -1) {
            const pathValueIndex = projectFlagIndex + 1;
            if (args.length > pathValueIndex && args[pathValueIndex] && !args[pathValueIndex].startsWith('-')) {
                projectPath = args[pathValueIndex];
            } else return void this.out.error('Invalid project path specified in command line arguments.');
        } else {
            const positionalPath = args.find(arg => !arg.startsWith('-'));
            if (positionalPath) projectPath = positionalPath;
        }

        const projectInfo = await PathFixer.getProjectInfo(`${projectPath}/tsconfig.json`);
        const pathFixer = new PathFixer(projectInfo, projectPath);

        if (watch) await pathFixer.watch();
        else await pathFixer.run();
    } catch (error) {
        if (error instanceof Error) this.out.error(`An error occurred: ${error.message}`);
        else this.out.error(`An unknown error occurred: ${error}`);
    }
}

const cli = new Utilities.DebugUI();
cli.addCommand('list', list, { description: 'Lists all configured dependencies.', usage: 'list' });
cli.addCommand('install', install, { description: 'Installs all or specific dependencies.', usage: 'install [name...]' });
cli.addCommand('add', add, { description: 'Adds a new dependency.', usage: 'add <repo_url> [name]' });
// cli.addCommand('output', output, { description: 'Sets the output path for a dependency.', usage: 'output <name_or_repo_url> <output_path> [source_path]' });
cli.addCommand('remove', remove, { description: 'Removes a dependency.', usage: 'remove <name_or_repo_url>' });
cli.addCommand('uninstall', uninstall, { description: 'Uninstalls all or specific dependencies.', usage: 'uninstall [name...]' });
cli.addCommand('fix-paths', fixPaths, { description: 'Fixes import paths in the compiled output.', usage: 'fix-paths [-p, --project <path>] [--watch]' });
try {
    // const command = process.argv[0];
    const skip = 2; // command.trim().toLowerCase() == 'npx' ? 2 : 1;
    const [commandName, ...args] = process.argv.slice(skip);

    if (commandName) {
        const command = cli.getCommand(commandName);
        if (command) {
            await command.exec.call(cli, commandName, args);
        } else {
            cli.out.error(`Unknown command: ${commandName}`);
            cli.getCommand('help')?.exec.call(cli, 'help', []);
        }
    } else cli.start();
} catch (error) {
    cli.out.error(`&C(255,180,220)╭─────────────────────────────────────────────`);
    cli.out.error(`&C(255,180,220)│ &C1${error}`);
    cli.out.error(`&C(255,180,220)╰─────────────────────────────────────────────`);
    process.exit(1)
}

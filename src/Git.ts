/**
 * @author NetFeez <netfeez.dev@gmail.com>
 * @description Executes git commands.
 * @license Apache-2.0
 */

import ChildProcess from 'child_process';

class Git {
    /**
     * Executes a command and returns its output.
     * @param command The command to execute.
     * @returns A promise that resolves with the command's output.
     */
    private static exec(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const [cmd, ...args] = command.split(' ');
            const process = ChildProcess.spawn(cmd, args, { shell: true  });

            let output = '';
            let errorOutput = '';

            process.stdout.on('data', (data) => output += data.toString());
            process.stderr.on('data', (data) => errorOutput += data.toString());
            process.on('error', (err) => reject(err));
            process.on('close', (code) => {
                if (code === 0) {
                    const result = (output + errorOutput).trim();
                    resolve(result);
                } else {
                    const errorMessage = `Command failed with code ${code}: ${command}\n${errorOutput || output}`.trim();
                    reject(new Error(errorMessage));
                }
            });
        });
    }
    /**
     * Clones a repository.
     * @param repo The repository URL.
     * @param path The path to clone the repository to.
     * @returns A promise that resolves when the command is finished.
     * @throws Error if the command fails.
     */
    public static async clone(repo: string, path: string, branch?: string): Promise<string> {
        return this.exec(`git clone ${repo} ${path}${branch ? ` --branch ${branch}` : ''}`);
    }

    /**
     * Checks out a branch/tag.
     * @param path The path to the repository.
     * @param branch The branch/tag to checkout.
     * @returns A promise that resolves when the command is finished.
     */
    public static async switch(path: string, branch: string): Promise<string> {
        return this.exec(`git -C ${path} switch ${branch}`);
    }
    /**
     * Pulls changes from a remote repository.
     * @param path The path to the repository.
     * @param branch The branch to pull from.
     * @returns A promise that resolves when the command is finished.
     */
    public static async pull(path: string, branch?: string): Promise<string> {
        const command = `git -C ${path} pull`;
        if (branch) return this.exec(`${command} --branch ${branch}`);
        else return this.exec(command);
    }
}

export default Git;

# DepFlow — Dependency Flow Manager

DepFlow is a focused dependency orchestration tool that lets projects consume Git repositories and NPM packages as managed dependencies. It simplifies building, extracting, and mapping artifacts into your application (for example, populating an `importmap` or TypeScript `paths`).

Key goals:
- Keep repository-sourced modules reproducible and buildable.
- Provide automatic path/importmap resolution for browser and TypeScript workflows.
- Support lightweight builder pipelines for extracted artifacts.

---

## Features
- Git-based dependencies with optional build pipelines
- NPM dependency extraction and local mirroring
- Automatic `tsconfig` paths and browser `importmap` generation via `dep sync`
- Flexible resolver aliases for local and CDN targets

---

## Installation

Install globally with npm to use the CLI system-wide:

```bash
npm install -g @netfeez/depflow
```

Alternatively, add it as a dev-dependency for project-specific usage.

---

## Quick Start

1. Create a configuration file (recommended name: `depflow.json`).
2. Run `dep install` to fetch and build all configured dependencies.
3. Run `dep sync` to update `tsconfig` paths and `importmap` (if configured).

CLI examples:

```bash
# install dependencies defined in .df.json
dep install
# --flow filepath.json for use an specific config

# sync tsconfig/importmap from the configuration
dep sync
```

---

## Configuration

DepFlow uses a JSON configuration file describing where to fetch dependencies and how to build and expose them. The minimal structure:

- `flowFolder` (string): folder where DepFlow stores temporary state (default: `.depflow`).
- `outDir` (string): project output root used by extract rules.
- `tsconfig` (string|null): optional path to TypeScript `tsconfig.json` to update `compilerOptions.paths`.
- `importmap` (string|null): optional path to write a browser `importmap`.
- `dependencies` (array): Git-based dependencies.
- `npmDependencies` (array): NPM packages to extract files from.

Each dependency supports `builder` steps (run commands, file extraction) and `resolver` entries that map aliases to local or CDN targets.

### Example Configuration

Below is an example adapted from a real project configuration. Use it as a template for your repository.

```json
{
    "flowFolder": ".depflow",
    "outDir": ".",
    "tsconfig": "tsconfig.web.json",
    "importmap": "public/importmap.json",
    "dependencies": [
        {
            "name": "NetFeez.Vizui",
            "repo": "https://github.com/NetFeez/Vizui.git",
            "builder": [
                {
                    "run": ["npm install", "npm run compile"],
                    "extract": [
                        { "from": "build/**/*.js", "to": "public/lib/vizui/", "replacer": "^build/" },
                        { "from": "build/**/*.d.ts", "to": "public/lib/vizui/", "replacer": "^build/" }
                    ]
                }
            ],
            "resolver": [
                { "alias": "vizui", "target": "public/lib/vizui/vizui.js" },
                { "alias": "vizui/*", "target": "public/lib/vizui/*" }
            ]
        }
    ],
    "npmDependencies": [
        {
            "name": "@netfeez/common",
            "version": "latest",
            "builder": [
                {
                    "extract": [
                        { "from": "build/**/*.js", "to": "public/lib/common/", "replacer": "^build/" },
                        { "from": "build/**/*.d.ts", "to": "public/lib/common/", "replacer": "^build/" }
                    ]
                }
            ],
            "resolver": [
                { "alias": "@netfeez/common", "target": "public/lib/common/index.js" },
                { "alias": "@netfeez/common/*", "target": "public/lib/common/*" }
            ]
        }
    ]
}
```

### Builder rules
- `run`: a string or array of shell commands executed inside the dependency checkout.
- `extract`: patterns describing which files to copy from the dependency build output into your project. Each extractor may include `from`, `to`, and an optional `replacer` regex used to rewrite paths.

### Resolver entries
- `alias`: module alias exposed to your project (used in `importmap` and `tsconfig` paths).
- `target`: a string path or an object with `local` and `cdn` properties for multi-target deployments.

---

## CLI Reference

Use the distribution script in `build/cli/bin.js` or install the package globally.

- `install`: Clone, build and extract artifacts for all dependencies in your config.
- `sync`: Generate/update `tsconfig` paths and browser `importmap` according to `resolver` entries.
- `list`: Show configured dependencies and their status.

Use `node ./build/cli/bin.js <command> --flow <config>` when running locally from the repository.

### Commands

The CLI exposes the following commands (all commands accept the global `--flow <file>` flag to specify a custom configuration file):

| Command | Usage | Description |
|---|---|---|
| `add` | `dep add <repo_url> [name] [--flow <file>]` | Add a git dependency to the configuration file. If the configuration file does not exist it will be created automatically (default: `depflow.json`). If `name` is omitted the repo name is used. |
| `remove` | `dep remove <name|repo_url> [--flow <file>]` | Remove a dependency by `name` or repository URL. |
| `install` | `dep install [name1 name2 ...] [--flow <file>]` | Clone, build and extract artifacts for all or specific dependencies. Runs `dep sync` after install. |
| `uninstall` | `dep uninstall [name1 name2 ...] [--flow <file>]` | Remove local files for configured dependencies. |
| `list` | `dep list [--flow <file>]` | List all dependencies declared in the configuration. |
| `rewrite-paths` | `dep rewrite-paths [--watch] [--cdn] [--flow <file>]` | Rewrite built files' paths according to resolver aliases. Use `--watch` to run a watcher; use `--cdn` to apply CDN targets instead of local targets. |
| `sync` | `dep sync [--cdn] [--flow <file>]` | Update `tsconfig` paths and generate `importmap` from resolver aliases. Use `--cdn` to prefer CDN targets when generating the importmap. |

### Flags

- `--flow <file>`: Specify an alternate configuration file (for example `.df.json` or `depflow.json`). If omitted, the CLI defaults to `depflow.json` in the current working directory.
- `--cdn`: When present for `sync` or `rewrite-paths`, instructs the tool to use CDN targets from resolver entries instead of `local` targets when generating the `importmap` or rewriting paths.
- `--watch` / `-w`: For `rewrite-paths` only — run a file watcher that keeps rewriting paths as files change.

Examples:

```bash
# install using custom flow file
dep install --flow .df.json

# sync using CDN targets for importmap
dep sync --flow .df.json --cdn

# rewrite paths and start watcher (local targets)
dep rewrite-paths --flow .df.json --watch
```

---

If you want, I can also:
- add quick examples for `tsconfig` path snippets generated by `dep sync`,
- or produce a Spanish summary for quick internal reference.

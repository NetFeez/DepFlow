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
- Reproducible checkouts: every install lands on the tag the configuration asks for

---

## Installation

Install globally with npm to use the CLI system-wide:

```bash
npm install -g @netfeez/depflow
```

Alternatively, add it as a dev-dependency for project-specific usage.

---

## Quick Start

1. Create a configuration file, `depflow.yml` (or any other name, passed with `--flow`).
2. Run `dep install` to fetch and build all configured dependencies.
3. Run `dep sync` to update `tsconfig` paths and `importmap` (if configured).

CLI examples:

```bash
# install the dependencies declared in depflow.yml
dep install
# --flow <file> to use a specific config instead

# sync tsconfig/importmap from the configuration
dep sync
```

---

## Configuration

DepFlow uses a single configuration file describing where to fetch dependencies and how to build and expose them. The format follows the extension: `.yml` and `.yaml` are read and written as YAML, `.json` as JSON. Without `--flow`, the CLI reads `depflow.yml` from the current working directory.

A YAML config is read as a document, so key order, indentation and the comments of the keys a save does not touch are preserved; a config created from scratch is written in block style, documented with a comment per key, and accompanied by an editor JSON Schema at `.depflow/schema.json`.

The minimal structure:

- `outDir` (string): project output root scanned by `rewrite-paths` (and by the watcher). Defaults to `dist`. Extraction targets are *not* relative to it, they are relative to the project root, see [Builder rules](#builder-rules).
- `tsconfig` (string|null): optional path to TypeScript `tsconfig.json` to update `compilerOptions.paths`.
- `importmap` (string|null): optional path to write a browser `importmap`.
- `actions` (object): named pipelines runnable with `dep run <action>`.
- `dependencies` (array): Git-based dependencies.
- `npmDependencies` (array): NPM packages to extract files from.

Each dependency supports `builder` steps (run commands, file extraction, content transformation) and `resolver` entries that map aliases to local or CDN targets.

### Example Configuration

Shown as JSON, which the CLI reads and writes just as well as YAML whenever the file is named `.json`. The extraction targets are shown as absolute paths, which is the only form that survives being copied between machines: a relative one is resolved against the project root, the same as every other relative path of the configuration.

```json
{
    "outDir": ".",
    "tsconfig": "tsconfig.web.json",
    "importmap": "public/importmap.json",
    "dependencies": [
        {
            "name": "NetFeez.Vizui",
            "repo": "https://github.com/NetFeez/Vizui.git",
            "tag": "v1.2.0",
            "builder": [
                {
                    "run": [ "npm install", "npm run compile" ]
                },
                {
                    "extract": {
                        "build/**/*.js": { "to": "/abs/path/to/app/public/lib/vizui/", "map": "^build/" },
                        "build/**/*.d.ts": { "to": "/abs/path/to/app/public/lib/vizui/", "map": "^build/" }
                    }
                }
            ],
            "resolver": {
                "vizui": "public/lib/vizui/vizui.js",
                "vizui/*": "public/lib/vizui/*"
            }
        }
    ],
    "npmDependencies": [
        {
            "name": "@netfeez/common",
            "version": "latest",
            "builder": [
                {
                    "extract": {
                        "build/**/*.js": { "to": "/abs/path/to/app/public/lib/common/", "map": "^build/" },
                        "build/**/*.d.ts": { "to": "/abs/path/to/app/public/lib/common/", "map": "^build/" }
                    }
                }
            ],
            "resolver": {
                "@netfeez/common": "public/lib/common/index.js",
                "@netfeez/common/*": "public/lib/common/*"
            }
        }
    ]
}
```

### Dependency identity

The `name` of a dependency is its identity, not a path: it is a single path segment, and it is also the
name of its checkout folder inside `.depflow`. A name may not be a path, may not start with a dot, and may
not be one of the names the flow folder reserves for itself (`schema.json` and `node_modules`).

The `repo` of a git dependency is any value `git clone` accepts: a URL with its scheme, an SSH address or a
local path of a repository. It always carries the `.git` suffix, whichever transport it comes in. `tag` is the
revision the checkout lands on after cloning and after every reinstall; it defaults to `main`.

### Builder rules

A pipeline is an ordered list of steps, each of them exactly one of:

- `run`: a string or a list of shell commands executed inside the dependency checkout. It accepts
  `maxTimeMs` (deadline in milliseconds, `-1` for no deadline, defaults to `60000`) and `allowFails`
  (whether a failed command is tolerated, defaults to `false`).
- `extract`: a mapping of source globs to extraction entries, or a destination folder as a shorthand for
  `**/*` → that folder. The globs are matched against the folder the pipeline works in (the dependency
  checkout, or the project itself for a `dep run` action) and an entry is a destination (`to`) plus,
  optionally, a `map` transformation applied to the destination path and a `transform` transformation
  applied to the content of the files. A relative `to` is resolved against the project root and an
  absolute one is used as it stands, so a pipeline reads from the dependency and deposits into the
  project. `map` runs against the *relative* path of the matched file, inside the destination.
- `transform`: a `glob` plus a `search`/`replace` transformation applied in place to the matched files.

Every transformation (`map`, `transform`, and the in-place `transform` step) takes one of two forms, and
they do not mean the same thing:

- a **string** is a pattern to *remove*: `"^build/"` strips that prefix from the path of every matched
  file, globally;
- an **object** `{ "search": ..., "flags": ..., "replace": ... }` is the only form that *substitutes*
  something: `search` is the pattern, `replace` what takes its place, and `flags` defaults to `g`.

```json
{ "map": "^build/" }
{ "map": { "search": "^build/(.*)\\.js$", "replace": "$1.js" } }
```

An object whose `replace` is empty removes the matches exactly as the string form does.

### Resolver entries

The `resolver` of a dependency, and the `resolver` of the configuration, are mappings of an alias to its
target. The target is either a string path or an object with these keys:

- `local` (string, required): the path the alias resolves to, resolved against the project root. `sync`
  turns it into the `tsconfig` `paths` entry (and into the `importmap` entry unless `--cdn` is given),
  and `rewrite-paths` rewrites the built files' imports that point at it.
- `type` (string, optional): the target holding the type declarations. It becomes the *first* entry of
  the generated `paths` array, so the editor finds the `.d.ts` next to the value. Unlike `local`, it is
  not resolved against the project root, so it has to be an absolute path.
- `cdn` (string, optional): the URL that replaces `local` when `--cdn` is given.

A `*` suffix on the alias turns it into a mapping, so `vizui/*` also covers `vizui/Button`.

---

## CLI Reference

Use the distribution script in `dist/cli/bin.js` or install the package globally.

- `install`: Clone, build and extract artifacts for all dependencies in your config.
- `sync`: Generate/update `tsconfig` paths and browser `importmap` according to `resolver` entries.
- `list`: Show configured dependencies and whether each one is installed.

Use `node ./dist/cli/bin.js <command> --flow <config>` when running locally from the repository.

### Commands

The CLI exposes the following commands (all commands accept the global `--flow <file>` flag to specify a custom configuration file):

| Command | Usage | Description |
|---|---|---|
| `add` | `dep add <repo_url> [name] [--flow <file>]` | Add a git dependency to the configuration file. If the configuration file does not exist it will be created automatically, in the format its extension asks for (default: `depflow.yml`). When the name is omitted it is derived from the repository, which only a GitHub repository allows; any other repository needs the name to be given. A name already taken by another dependency is refused. |
| `remove` | `dep remove <name\|repo_url> [--flow <file>]` | Remove a dependency by `name` or repository URL and uninstall its local files. An identifier that no dependency declares is an error. |
| `install` | `dep install [name1 name2 ...] [--flow <file>]` | Clone, build and extract artifacts for all or specific dependencies. Runs `dep sync` after install. A dependency that is already present is brought to the revision of its `tag` instead of being cloned again. |
| `list` | `dep list [--flow <file>]` | List all dependencies declared in the configuration, telling an `installed` one (its folder is in place under `.depflow`) from a `missing` one. |
| `rewrite-paths` | `dep rewrite-paths [--watch] [--cdn] [--flow <file>]` | Rewrite built files' paths according to resolver aliases. Use `--watch` to run a watcher; use `--cdn` to apply CDN targets instead of local targets. A built file that cannot be rewritten makes the command fail instead of being left pointing at the source tree. |
| `sync` | `dep sync [--cdn] [--flow <file>]` | Update `tsconfig` paths and generate `importmap` from resolver aliases. Use `--cdn` to prefer CDN targets when generating the importmap. |

### Flags

- `--flow <file>` / `-f <file>` / `-p <file>`: Specify an alternate configuration file (for example `depflow.json` or `depflow.yaml`). When omitted, the CLI uses `depflow.yml` in the current working directory; any other file has to be named here.
- `--cdn`: When present for `sync` or `rewrite-paths`, instructs the tool to use CDN targets from resolver entries instead of `local` targets when generating the `importmap` or rewriting paths.
- `--watch` / `-w`: For `rewrite-paths` only — run a file watcher that keeps rewriting paths as files change.

Every token starting with a dash is a flag, and a flag is the whole token, so short clusters are not expanded (`-abc` is the single flag `-abc`, not `-a -b -c`). A value flag takes the value from the next token when that token is not a flag, or written inline as `--flag=value`; a boolean flag never consumes the next token and only accepts `=true` or `=false` inline. Names are matched with or without their dash prefix, so `-f` and `--flow` reach the same flag. The last occurrence of a flag wins, `--` ends the flags and turns the remaining tokens into positional arguments, and an undeclared flag is reported as an error.

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

## Build steps in depth

A `run` step is the only place where a shell script is interpreted, and it is where the failure semantics
live:

- every command of the step runs, even after one of them fails, so a build reports the whole picture;
- `allowFails: true` turns a failed command into information: the step completes and the build continues;
- `maxTimeMs` is a deadline for the whole step, not per command, and a deadline that is reached fails the
  step even when `allowFails` is set: the work never finished, so the result is not the one that was asked for.

The verdict of a step is awaited, never read from a log: a build that cannot do what it was configured to
do fails, and the failure travels up to whoever asked for the build.

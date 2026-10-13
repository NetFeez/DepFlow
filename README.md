# DepFlow

DepFlow turns Git repositories and NPM packages into managed dependencies of a project: it fetches
them into a single `.depflow` folder, runs a build pipeline over each one, and wires the resulting
artifacts into the project through path aliases. Those aliases are then written into a TypeScript
`tsconfig` and a browser `importmap`, and the built files can be rewritten to point either at the
local artifacts or at their CDN counterparts.

The configuration is a single **YAML** file, `depflow.yml` by default. JSON is supported as a
secondary format for tooling, and the two can be converted into each other from the CLI.

---

## Features

- Git dependencies cloned at a pinned revision and rebuilt on demand.
- NPM dependencies installed into the flow folder and built the same way.
- Ordered build pipelines per dependency: run shell commands, extract files, transform content.
- A resolver that maps aliases to local and CDN targets.
- `tsconfig` `paths` and browser `importmap` generated from those aliases.
- Import rewriting of the built files, with a watch mode.
- Three run modes (`default`, `--verbose`, `--silent`) and optional decoration.
- An evidence trail: the complete output of every command is written under `.logs` in every mode.
- Named actions runnable with `dep run`.
- Configuration conversion between YAML and JSON.

---

## Installation

```bash
npm install -g depflow
```

Or add it as a project dev-dependency and invoke the `dep` binary from there.

---

## Quick Start

### Requirements

DepFlow is an ESM-only Node.js package (`"type": "module"`) and needs an LTS Node.js with native
ECMAScript module support. There is no CommonJS build. `git` and `npm` are used directly, so both
must be on `PATH` to install the corresponding kinds of dependency.

```bash
# 1. Create a configuration file (default name: depflow.yml)
#    `dep add` creates it from the defaults and registers the first dependency.
dep add NetFeez/vizui

# 2. Fetch, build and extract every dependency, then synchronize the aliases
dep install

# 3. Inspect what is declared and whether its files are in place
dep list
```

`dep install` runs `dep sync` on its own after fetching, so step 2 already writes the `tsconfig`
paths and the `importmap` when those files are configured.

---

## Configuration

DepFlow reads a single configuration file. Its format is chosen by extension:

| Extension | Format | Notes |
|---|---|---|
| `.yml`, `.yaml` | YAML | The default. The document is preserved across saves. |
| `.json` | JSON | Secondary format, read and written just as well. |

Without `--flow`, the CLI reads `depflow.yml` from the current working directory. The directory that
holds the configuration file is the **project root**: every relative path of the configuration is
resolved against it.

A YAML config is handled as a document, so key order, indentation and the comments of keys a save
does not touch survive a round trip. A config created from scratch is written in block style with the
file header and one comment per key, taken from the schema descriptions, so a generated file
documents itself.

The YAML dialect DepFlow reads is block style: non-empty flow collections (`[ ... ]` and `{ ... }`)
are not supported and are reported as an error when the file is loaded. Write lists and maps as
indented blocks; the empty `{}` and `[]` the generated file uses are fine. Use JSON if a
flow-style document is a hard requirement, or let `dep yaml-to-json` produce one.

Whenever the config is saved, DepFlow also refreshes the editor JSON Schema at `.depflow/schema.json`
and points `$schema` at it, which gives validation and autocompletion in editors that understand JSON
Schema.

### Generated configuration

A freshly generated `depflow.yml` looks like this:

```yaml
# Depflow Configuration File
# You can use the Red Hat extension for JSON schema validation in VSCode: "$schema: .depflow/schema.json"


# Path to the JSON Schema describing the configuration. Used by editors and tools to provide validation, autocompletion and other features.
$schema: .depflow/schema.json
# Output directory for built files. Can be relative or absolute. Defaults to "dist".
outDir: dist
# Path to the tsconfig.json file. Can be relative or absolute. Defaults to "tsconfig.json".
tsconfig: null
# Path to the importmap.json file. Can be relative or absolute. Defaults to "importmap.json".
importmap: null
# Named build actions. Each action runs a pipeline of run, extract and transform steps.
actions: {}
# Mapping of dependency names to their resolution targets (local file or CDN). Paths are resolved relative to this folder.
resolver: {}
# Git dependencies to clone and build, each an object with a name and a repo.
dependencies: []
# NPM dependencies to install and build, each an object with a name and a version.
npmDependencies: []
```

### Top-level keys

| Key | Type | Default | Meaning |
|---|---|---|---|
| `$schema` | string | `.depflow/schema.json` | Path to the JSON Schema used by editors. Refreshed on every save. |
| `outDir` | string | `dist` | Output root scanned by `rewrite-paths` and its watcher. Relative or absolute. |
| `tsconfig` | string \| null | `null` | Path to a `tsconfig.json` whose `compilerOptions.paths` `sync` updates. When `null`, synchronization of the tsconfig is skipped. |
| `importmap` | string \| null | `null` | Path to an `importmap.json` that `sync` writes. When `null`, synchronization of the import map is skipped. |
| `actions` | object | `{}` | Named build pipelines runnable with `dep run <action>`. |
| `resolver` | object | `{}` | Aliases shared by the whole project, merged with each dependency's own `resolver`. |
| `dependencies` | array | `[]` | Git dependencies. |
| `npmDependencies` | array | `[]` | NPM dependencies. |

Streaming collections default to a fresh empty value on every load, so a processed document never
shares state with the schema.

### Dependencies

A **git dependency** is cloned into `.depflow/<user>/<repo>` and rebuilt from its `tag` on every install:

```yaml
dependencies:
  - name: NetFeez/vizui
    repo: https://github.com/NetFeez/vizui.git
    tag: main
    builder: []
    resolver: {}
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | — (required) | Identity of the dependency. See [Dependency identity](#dependency-identity). |
| `repo` | string | — (required) | Any value `git clone` accepts, always ending in `.git`. |
| `tag` | string | `main` | Tag, branch or commit the checkout is left on. |
| `builder` | array | `[]` | Build pipeline applied after cloning. |
| `resolver` | object | `{}` | Aliases contributed by this dependency. |

An **NPM dependency** is installed into `.depflow/node_modules/<name>` and built the same way:

```yaml
npmDependencies:
  - name: "@netfeez/common"
    version: latest
    builder: []
    resolver: {}
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | — (required) | Package name, optionally scoped. |
| `version` | string | — (required) | Version or semver range to install. |
| `builder` | array | `[]` | Build pipeline applied after installing. |
| `resolver` | object | `{}` | Aliases contributed by this dependency. |

Git dependencies are installed before NPM dependencies.

### Dependency identity

The `name` of a dependency is an identity, not an arbitrary path:

- A git name is a `<user>/<repo>` pair or a **single path segment** (letters, digits, `.`, `_`, `-`),
  and it is also the path of its checkout folder inside `.depflow`. It may not lead with
  `schema.json` or `node_modules`, the two names the flow folder reserves for itself, and it is at
  most one `/`.
- An NPM name is a package name, optionally scoped (`@scope/name`).

The name of a git dependency can be derived from its repository only when that repository is a GitHub
one, where it becomes `<user>/<repo>` (for example `NetFeez/vizui`). For any other repository the
name has to be given explicitly to `dep add`.

`dep add` accepts a GitHub repository written in any of its usual forms, canonicalizes it to the
repository git clones from, always ending in `.git`, and derives the name from it when no name is
given:

```bash
dep add netfeez/vizui                          # https://github.com/netfeez/vizui.git, name netfeez/vizui
dep add https://github.com/netfeez/vizui        # https://github.com/netfeez/vizui.git, name netfeez/vizui
dep add https://github.com/netfeez/vizui.git    # https://github.com/netfeez/vizui.git, name netfeez/vizui
dep add git@github.com:/netfeez/vizui           # git@github.com:netfeez/vizui.git, name netfeez/vizui
```

### Build pipelines

The `builder` of a dependency, and each entry of a named `action`, is an ordered list of steps. Every
step is an object carrying exactly one of `run`, `extract` or `transform`. A step that fails without
tolerating its failures stops the pipeline, and the steps after it are reported as steps that never
ran.

**`run`** executes one shell command, or a list of them, in the pipeline's working directory, which is
the dependency checkout for an install and the project root for a `dep run` action:

```yaml
builder:
  - run: npm run build
  - run:
      - npm ci
      - npm run compile
    maxTimeMs: 120000
    allowFails: false
```

| Key | Type | Default | Meaning |
|---|---|---|---|
| `run` | string \| string[] | — (required) | Command or commands to execute, in order. |
| `maxTimeMs` | number | `60000` | Deadline for the whole step in milliseconds. `-1` disables the limit. |
| `allowFails` | boolean | `false` | Whether a failed command is tolerated, so the step completes anyway. |

**`extract`** copies files matched by source globs from the working directory into a destination:

```yaml
builder:
  - extract:
      "build/**/*.js":
        to: dist/vizui
        map: "^build/"
      "build/**/*.d.ts":
        to: dist/vizui
        map: "^build/"
```

The `extract` value is either a mapping of glob → entry, or a single string used as a shorthand for
extracting every file (`**/*`) into that folder. Each entry is:

| Key | Type | Meaning |
|---|---|---|
| `to` | string — required | Destination folder. A relative path is resolved against the project root; an absolute one is used as it stands. |
| `map` | transform | Transformation applied to the destination path of each file, relative to the working directory. |
| `transform` | transform | Transformation applied to the content of each file. |

**`transform`** applies a search/replace transformation in place to every file matched by a glob:

```yaml
builder:
  - transform:
      glob: "build/**/*.js"
      search: "process\\.env\\.NODE_ENV"
      replace: "\"production\""
      flags: g
```

### Transformations

`map`, the `transform` of an extraction entry and the in-place `transform` step all accept one of two
forms, and they do not mean the same thing:

- a **string** is a pattern whose matches are **removed**. `"^build/"` strips that prefix from every
  matched path.
- an **object** is the only form that **substitutes**: `search` is the pattern, `replace` what takes
  its place, and `flags` (default `g`) is applied to the regular expression. An object with an empty
  or absent `replace` removes the matches, exactly as the string form does.

```yaml
map: "^build/"
transform:
  search: "^\\.\\/(.*)$"
  replace: "$1"
  flags: g
```

### Resolver entries

The `resolver` of the project and the `resolver` of a dependency are mappings of an alias to its
target. The target is either a plain string path or an object:

```yaml
resolver:
  "@utils": src/utils
  "@app/*": src/app
  "@vizui":
    local: dist/vizui/index.js
    type: /abs/path/types/vizui.d.ts
    cdn: https://cdn.example.com/vizui/index.js
```

| Key | Type | Meaning |
|---|---|---|
| `local` | string — required | The path the alias resolves to, resolved against the project root. `sync` turns it into the `tsconfig` `paths` entry and the `importmap` entry, and `rewrite-paths` rewrites imports that point at it. With `--cdn`, an alias that also declares a `cdn` target uses it instead. |
| `type` | string | The target holding the type declarations. It becomes the **first** entry of the generated `paths` array, so the editor finds the `.d.ts`. Unlike `local`, it is not resolved against the project root, so it has to be an absolute path. |
| `cdn` | string | The URL that replaces `local` when `--cdn` is given. |

An alias ending in `/` or `/*` is a **wildcard** alias: `@app/*` also covers `@app/Button`. Dependency
resolvers are compiled before the project resolver, so a project entry with the same alias wins.

### Named actions

`actions` maps a name to a list of `run`, `extract` and `transform` steps, run in the project root by
`dep run <name>`:

```yaml
actions:
  build:
    - run: npm run build
    - extract:
        "dist/**/*.js":
          to: public/lib
          map: "^dist/"
  lint:
    - run: npm run lint
    - run: npm run typecheck
```

### Full example

```yaml
$schema: .depflow/schema.json
outDir: dist
tsconfig: tsconfig.json
importmap: public/importmap.json

resolver:
  "@app/*": src/app

actions:
  build:
    - run: npm run build

dependencies:
  - name: NetFeez/vizui
    repo: https://github.com/NetFeez/vizui.git
    tag: v1.2.0
    builder:
      - run:
          - npm ci
          - npm run compile
      - extract:
          "build/**/*.js":
            to: public/lib/vizui
            map: "^build/"
          "build/**/*.d.ts":
            to: public/lib/vizui
            map: "^build/"
    resolver:
      "@vizui": public/lib/vizui/vizui.js
      "@vizui/*": public/lib/vizui

npmDependencies:
  - name: "@netfeez/common"
    version: latest
    builder:
      - extract:
          "build/**/*.js":
            to: public/lib/common
            map: "^build/"
    resolver:
      "@netfeez/common": public/lib/common/index.js
      "@netfeez/common/*": public/lib/common
```

The same configuration can be kept as JSON when the file is named `.json`. The command reads the
config named by `--flow` (default `depflow.yml`) and writes a sibling file; its optional positional
argument is the **output** path, not the input:

```bash
dep yaml-to-json                      # reads depflow.yml, writes depflow.json
dep json-to-yaml --flow depflow.json  # reads depflow.json, writes depflow.yaml
dep yaml-to-json build/depflow.json   # reads depflow.yml, writes build/depflow.json
```

---

## CLI Reference

```
dep <command> [arguments] [flags]
```

The **first token is always the command name**; global flags are parsed from the tokens that follow
it. `dep --flow x install` is read as the command `--flow`, so flags belong after the command:
`dep install --flow x`.

### Commands

| Command | Usage | Description |
|---|---|---|
| `add` | `dep add <repo> [name] [--tag <ref>]` or `dep add --npm <name>[@<version>]` | Add a dependency to the configuration, creating the file from the defaults if it does not exist. A git repository may be given as `user/repo`, as an HTTP(S) URL or as an ssh address, with or without the `.git` suffix; it is canonicalized to the URL git clones from, and its name is derived from it when omitted, which only a GitHub repository allows. `--tag` sets the tag, branch or commit it is checked out at (default `main`). With `--npm` the argument is an npm package `<name>[@<version>]`, defaulting to `latest`, registered under `npmDependencies`. A name already taken is refused. |
| `remove` | `dep remove <name\|repo_url>` | Remove a dependency by name (git or npm) or by git repository URL, and uninstall its local files. An identifier no dependency declares is an error. |
| `install` | `dep install [name...]` | Fetch, build and extract every dependency, or only the named ones. A checkout already in place is updated to its `tag` instead of cloned again. Runs `sync` afterwards. |
| `run` | `dep run <action>` | Run a named action from `actions`, in the project root. |
| `list` | `dep list` | List the declared dependencies, marking each one `installed` or `missing`. |
| `rewrite-paths` | `dep rewrite-paths [--watch] [--cdn]` | Rewrite import specifiers in the built files of `outDir` according to the resolver. A file that cannot be rewritten fails the command. |
| `sync` | `dep sync [--cdn]` | Write the resolver aliases into the configured `tsconfig` and `importmap`. |
| `resolver` | `dep resolver add <alias> <local> [--type <t>] [--cdn-url <url>] [--force] \| remove <alias> \| list \| clear` | Edit the resolver aliases. Without `--dep` the project resolver is edited; with it, the named dependency's own resolver. `add` refuses an alias already taken unless `--force` is given. |
| `builder` | `dep builder add <run\|extract\|transform> ... \| remove <index> \| move <from> <to> \| list \| clear` | Edit the build pipeline of the dependency named by `--dep` or of the action named by `--action`. `add run` takes one or more commands (`--max-time`, `--allow-fails`); `add extract` takes a glob (`--to`, `--map`); `add transform` takes a glob (`--search`, `--replace`, `--flags`). `--index` chooses where the step is inserted. |
| `action` | `dep action create <name> \| remove <name> \| list` | Create, remove or list the named actions of the configuration. A new action starts empty and is filled through `builder --action`. |
| `config` | `dep config get [key] \| set <key> <value> \| unset <key>` | Read and edit the top-level settings `outDir`, `tsconfig` and `importmap`. `set` accepts `null` for the nullable ones; `outDir` cannot be unset. |
| `json-to-yaml` | `dep json-to-yaml [output.yaml]` | Convert the config to YAML. The output name is derived from the input name when omitted. |
| `yaml-to-json` | `dep yaml-to-json [output.json]` | Convert the config to JSON. The output name is derived from the input name when omitted. |

### Console commands

The CLI is built on a small console interface that also carries two commands:

| Command | Description |
|---|---|
| `dep help` | Print the global flags and every command, with its usage, description and arguments. The help is written by the terminal and is left untouched by `--silent` and `--decorate=false`. |
| `dep exit` | Leave the process. |

This build does not drive that interface interactively: the first token of an invocation is always
taken as the command name, so an empty invocation is reported as an unknown command and the help is
printed rather than a prompt being opened.

### Flags

These are the global flags: every command accepts all of them.

| Flag | Aliases | Default | Description |
|---|---|---|---|
| `--flow <file>` | `-p`, `-f` | `depflow.yml` | Configuration file the command operates on. |
| `--cdn` | — | `false` | Resolve to CDN targets instead of local ones (for `sync` and `rewrite-paths`). |
| `--watch` | `-w` | `false` | Keep watching the built files and rewriting their paths on every change (`rewrite-paths`). |
| `--verbose` | `-v` | `false` | Stream the output of every command as it runs, attributed to the command that wrote it. |
| `--silent` | — | `false` | Say only what failed, one line per failed command. |
| `--decorate` | — | `true` | Draw boxes, indentation, timestamps, levels and names. Use `--decorate=false` to leave the content alone. |

Beside the global ones, an editing command declares the flags it owns. A flag is only accepted by the
command that declares it: `dep install --to x` is answered with `Unknown flag: --to`, and the help
lists the owned flags under their command.

| Command | Flag | Aliases | Default | Description |
|---|---|---|---|---|
| `add` | `--npm` | — | `false` | Add an npm dependency instead of a git one. |
| `add` | `--tag <ref>` | — | `main` | Tag, branch or commit the added git dependency is checked out at. |
| `resolver` | `--dep <name>` | — | — | Dependency whose resolver is edited. Omitted, the project resolver is edited. |
| `resolver` | `--type <type>` | — | — | Type identifier of a resolver target, set alongside its local path. |
| `resolver` | `--cdnUrl <url>` | `--cdn-url` | — | CDN URL of a resolver target, set alongside its local path. |
| `resolver` | `--force` | — | `false` | Overwrite an existing resolver alias instead of failing. |
| `builder` | `--dep <name>` | — | — | Dependency whose build pipeline is edited. |
| `builder` | `--action <name>` | — | — | Action whose build pipeline is edited. |
| `builder` | `--to <dir>` | — | — | Destination folder of an extract build step. |
| `builder` | `--map <pattern>` | — | — | Pattern applied to the destination path of an extract build step. |
| `builder` | `--search <regex>` | — | — | Regular expression a transform build step searches for. |
| `builder` | `--replace <text>` | — | — | Replacement string of a transform build step. |
| `builder` | `--flags <flags>` | — | `g` | Flags of the regular expression of a transform build step. |
| `builder` | `--maxTime <ms>` | `--max-time` | `60000` | Maximum execution time of a run build step; `-1` disables the limit. |
| `builder` | `--allowFails` | `--allow-fails` | `false` | Whether the commands of a run build step may fail. |
| `builder` | `--index <n>` | — | end | Position at which a build step is inserted. |

Flag parsing rules:

- A flag is the whole token; short clusters are not expanded (`-abc` is the single flag `-abc`).
- Names are matched with or without their dash prefix, so `-f` and `--flow` reach the same flag.
- A value flag takes the next token as its value when that token is not a flag, or an inline value as
  `--flag=value`. A boolean flag never consumes the next token and only accepts `=true` or `=false`,
  so the undecorated form is `--decorate=false`.
- The last occurrence of a flag wins, `--` ends the flags and turns every remaining token into a
  positional argument, and an undeclared flag is an error.

```bash
dep install --flow .df.yml
dep sync --flow .df.yml --cdn
dep rewrite-paths --flow .df.yml --watch
dep run build --decorate=false
```

---

## Run Modes and the Evidence Trail

Every command a run executes writes its **complete** output to

```
.logs/{YYYY}.{MM}.{DD}/[name] {HH}.{mm}.{ss}.{ms}.vlog
```

under the working directory, whatever the mode. The file keeps the format tokens of the logger, so it
is a complete transcript of the run. What a mode changes is how much of that output reaches the
screen:

| Mode | Flags | What it shows |
|---|---|---|
| Default | *(none)* | One result line per command, and the complete output of a command that failed, under its diagnostic. |
| Verbose | `--verbose` / `-v` | Every line of every command as it comes, each attributed to the command that wrote it. The buffer is not repeated. |
| Silent | `--silent` | One line per failed command, and nothing else. |

`--silent` wins over `--verbose` when both are given. `--decorate=false` combines with any mode to
drop the boxes, indentation, timestamps, levels and names, keeping the color of the markers and the
diagnostics, which carry information.

Commands that are not part of a pipeline (the git and npm acquisition of a dependency) are reported
as `C<M>`; the commands inside a pipeline with more than one `run` step are qualified as
`S<N> · C<M>`, so a command identity is never ambiguous.

---

## How `sync` and `rewrite-paths` Work

`sync` compiles the resolver into aliases and writes them to the configured files:

- the **tsconfig** `compilerOptions.paths` receives one entry per alias, always pointing at the local
  target. A wildcard alias becomes `<alias>/*`. When a target declares a `type`, the type path is the
  first element of the array and the local path the second.
- the **importmap** `imports` receives one entry per alias. A wildcard alias's key keeps a trailing
  `/`. Local targets are written relative to the directory of the importmap file. With `--cdn`, an
  alias that declares a `cdn` target uses it; the others keep their local path. Existing `scopes` are
  preserved.

`rewrite-paths` scans `outDir` for files ending in `.js`, `.ts`, `.jsx`, `.tsx`, `.cjs` or `.mjs`
and rewrites every `from '...'` specifier whose module path matches an alias:

- in **local** mode the specifier becomes a path relative to the file, written with `/` separators.
- in **cdn** mode an alias that declares a `cdn` target resolves to that URL; the rest keep their
  local relative path.

Only `from '...'` specifiers are rewritten; a bare side-effect import such as `import './x'` is not
touched. `--watch` rewrites once and then keeps rewriting as files change.

---

## Project Layout

```text
<project root>/
├── depflow.yml               # the configuration (any name, passed with --flow)
├── .depflow/                 # the flow folder, owned by DepFlow
│   ├── <user>/<repo>/        # one checkout per git dependency
│   ├── node_modules/         # npm dependencies, installed here and not in the project's
│   └── schema.json           # the editor JSON Schema, refreshed on every config save
├── <outDir>/                 # the built files rewrite-paths scans (default: dist)
└── .logs/                    # the evidence trail, under the working directory
    └── {YYYY}.{MM}.{DD}/
        └── [name] {HH}.{mm}.{ss}.{ms}.vlog
```

The project root is the directory of the configuration file. The flow folder is reserved for
DepFlow: a dependency name may not lead with `schema.json` or `node_modules`, may not start with a
dot, and is at most one `/` (a `<user>/<repo>` pair), so no dependency folder can escape `.depflow`.

---

## Development

The project is ESM-only TypeScript, compiled with `tsc` and exercised by a bundled test runner; no
test framework is installed.

```bash
npm install     # install the dependencies
npm run build   # clean and compile src/ into dist/
npm run dev     # recompile on change (tsc --watch)
npm test        # compile the tests and run the whole suite
npm run clean   # remove dist/, dist-test/ and the .tsbuildinfo files
```

The suite is offline: the git and npm fixtures are local, so the tests need no network. The test
entry point is `dist-test/tests/index.js`, and `npm test` exits non-zero on any failure.

---

## License

Apache-2.0. See [LICENCE](LICENCE).

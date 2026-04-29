# 🚀 DepFlow (Dependency Flow)

**DepFlow** is a lightweight, high-performance dependency manager that leverages Git repositories and NPM packages to orchestrate your project's infrastructure. Designed for the **NetFeez** ecosystem, it allows you to manage dependencies directly from their source without the overhead of traditional package managers.

Starting with **v2.0.0**, DepFlow introduces a schema-driven architecture that automatically configures your development environment, providing a seamless experience in editors like VSCode.

---

# 💾 Installation

Install DepFlow globally using **npm**:

```console
npm install -g @netfeez/depflow
```

> [!TIP]
> Global installation makes the `dep` command available everywhere. For version 2.0.0, ensure you are using the `@netfeez` scope.

---

# 💻 CLI Usage

DepFlow offers a clean interface for managing your project's lifecycle:

### Commands

| Command | Usage | Description |
|---|---|---|
| `sync` | `dep sync` | **(New)** Synchronizes `tsconfig.json` paths and `importmap` based on your config. |
| `install`| `dep install [name...]`| Clones, builds, and sets up all or specific dependencies. |
| `list` | `dep list` | Lists all dependencies configured in your project. |
| `add` | `dep add <repo_url> [name]` | Adds a new repository dependency to your configuration. |
| `remove`| `dep remove <name>` | Removes a dependency from the configuration. |
| `uninstall`| `dep uninstall [name...]`| Removes the local files of your dependencies. |

---

# ⚙️ Configuration File (`depflow.json`)

The configuration has evolved from a simple array to a powerful object schema.

## New Schema Structure

```json
{
    "flowFolder": ".depflow",
    "tsconfig": "tsconfig.json",
    "importmap": "importmap.json",
    "dependencies": [
        {
            "name": "my-library",
            "repo": "https://github.com/user/my-library.git",
            "tag": "main",
            "builder": [
                { "run": "npm install", "maxTimeMs": 10000 },
                { "move": { "build": "web/logic/.lib/my-lib" } }
            ],
            "resolver": [
                {
                    "alias": "my-lib",
                    "target": {
                        "local": "./web/logic/.lib/my-lib/index.js",
                        "cdn": "https://cdn.com/my-lib.js"
                    }
                }
            ]
        }
    ]
}
```

## Fields Explained

### Root Configuration
* **`flowFolder`** (string): The directory where DepFlow stores internal data (default: `.depflow`).
* **`tsconfig`** (string, optional): Path to your TypeScript config. When set, `dep sync` will automatically manage your `compilerOptions.paths`.
* **`importmap`** (string, optional): Path to your importmap file. When set, `dep sync` keeps your browser imports up to date.
* **`dependencies`** (array): Your list of Git-based dependencies.

### Dependency Object
* **`name`** (string): Unique identifier for the dependency.
* **`repo`** (string): The Git repository URL.
* **`tag`** (string, optional): **(New)** Specify a branch, tag, or commit hash (e.g., `main`, `v1.2.0`).
* **`builder`**: A pipeline to build and organize the dependency files.
  * **`run`** (string | string[]): Command(s) to execute (e.g., `npm run compile`).
  * **`move`** (string | object): Defines where to place the built files.
* **`resolver`**: **(Renamed)** Configuration for path mapping.
  *  alias`**: The import alias (e.g., `my-lib`).
  *   **`target`**: Can be a string path or an object defining `local` and `cdn` targets for hybrid environments.

---

# 🚀 Migration to v2.0.0

To upgrade from v1:
1.  Wrap your existing array into a `{"dependencies": [...]}` object.
2.  Rename any `pathResolver` fields to `resolver`.
3.  Add the `$schema` field to enable VSCode autocompletion and validation.
4.  Run `dep sync` to initialize your environment.
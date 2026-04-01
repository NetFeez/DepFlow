# 🚀 Dependency Flow

This project provides a lightweight, straightforward dependency manager that leverages Git repositories. It's designed for simplicity and efficiency, allowing you to manage project dependencies directly from their source repositories without the complexity of larger package managers.

This tool is actively used in real-world projects, which ensures it is continuously improved and enhanced with practical features based on actual usage.

---

# 💾 Installation

Install the Dependency Manager globally using **npm**:

```console
npm install -g depflow
```

> [!NOTE]
> A global installation (`-g`) makes the `dep` command available from any directory in your terminal.

---

# 💻 CLI Usage

You can interact with the dependency flow in two ways:

1.  **Interactive Mode**: Run `dep` without any arguments to open an interactive command-line interface.
2.  **Direct Command**: Execute commands directly, for example: `dep list`.

### Commands

| Command | Usage | Description |
|---|---|---|
| `list` | `dep list` | Lists all dependencies configured in `depFlow.json`. |
| `add` | `dep add <repo_url> [name]` | Adds a new dependency to your configuration. |
| `remove`| `dep remove <name_or_repo_url>` | Removes a dependency using its name or repository URL. |
| `install`| `dep install [name...]`| Clones and sets up all dependencies, or specific ones. |
| `uninstall`| `dep uninstall [name...]`| Removes the files of all, or specific, dependencies. |

---

# ⚙️ Configuration File (`depFlow.json`)

All dependencies are defined in a `depFlow.json` file located in your project's root directory. This file contains a JSON array of dependency objects.

## Schema and Examples

Here’s a look at the structure of a `depFlow.json` file:

```json
[
  {
    "name": "my-library",
    "repo": "https://github.com/user/my-library.git",
    "branch": "main",
    "builder": [ { "move": "libs/my-library"} ]
  },
  {
    "name": "another-dependency",
    "repo": "https://github.com/user/another.git",
    "builder": [
      { "run": "npm install" },
      { "run": [
        "npm run compile",
        "npm run normalize"
      ] }
      {
        "move": {
          "out": {
            "src/": "public/js/another-dep/",
            "assets/css/": "public/css/"
          }
        }
      }
    ]
  }
]
```

## Fields Explained

*   **`name`** (string): A unique identifier for the dependency. If you don't provide one with the `add` command, a name will be generated from the repository URL.
*   **`repo`** (string): The full HTTPS or SSH URL for the Git repository.
*   **`branch`** (string, optional): The name of the branch you want to clone. If omitted, the repository's default branch is used.
*   **`build`: an array to indicate a pipeline to build the repository.
*   **`builder[].run`** (string | string[]): defines a command or list of commands.
*   **`builder[].move`** (string | string[] | object, optional): Defines where the dependency's files should be placed.
    *   **As a string**: The entire repository is cloned into this single path.
    *   **As a string array**: The repository content is copied to each path in the array.
    *   **As an object**: A map where keys are source paths within the repository and values are the destination paths in your project. You can use `'/'` as a key to refer to the repository's root.

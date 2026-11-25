# Loadout Manager

English | [Русский](https://github.com/steindvart/dsh-loadout-manager/blob/main/README_RU.md) | [中文](https://github.com/steindvart/dsh-loadout-manager/blob/main/README_ZH.md)

A plugin for DeepSeek Harness (DSH). Stock DSH has no single page that shows which skills and MCP servers are available globally and in a given project, and it has no rules mechanism. Loadout Manager adds both: it shows skills and MCP servers by level, lets you manage them, adds rules to the agent context next to AGENTS.md, and installs skills and rules from indexes you configure.

![The Loadout Manager page: the Skills tab in the Global scope, with an On, Manual, or Off switch for each skill](assets/main-window.png)

## Features

### Overview by level

Loadout Manager appears in the left sidebar. At the top of the page you pick a scope: Global or one of your workspaces. The Skills, Catalog, Instructions, and MCP tabs show everything the agent gets in that scope, including the AGENTS.md and CLAUDE.md files DSH loads on its own. Any file opens right in its row.

### Skill management

| State | Model catalog | `/name` call |
| --- | --- | --- |
| `on` | visible | works |
| `manual` | hidden | works |
| `off` | hidden | hidden |

In `manual` mode the skill's description stays out of the context, but you can still call the skill by hand. When a skill with the same name exists both in the project and globally, the panel marks the overridden one. A skill you no longer need goes to the trash.

### Rules

A rule is a Markdown file in `~/.dsh/rules/`, `~/.agents/rules/`, or `<project>/.agents/rules/`. Enabled rules reach the agent and its subagents right after AGENTS.md, and file edits reach the agent on the next step. Each rule is switched on and off on its own.

### Catalog

An index is a JSON file that lists skills and rules. Point the plugin at a git repository, a local directory, or an HTTP URL to `loadout-index.json`, then open the Catalog tab. Search across sources, install an entry into the chosen scope, and update it when the source publishes newer content. The tab shows where each installed copy came from and marks local edits; an update asks before replacing them.

A minimal index:

```json
{
  "format": 1,
  "title": "Team skills",
  "skills": [
    { "name": "tdd", "description": "Test-first workflow", "path": "skills/tdd" }
  ],
  "rules": [
    { "name": "russian-docs", "description": "Russian prose", "path": "rules/russian-docs.md" }
  ]
}
```

Sources are listed in `~/.agents/loadout-indexes.json`. A source can be a git repository (`https://github.com/owner/repo` or `owner/repo`), an absolute local directory, or an HTTP URL to the index file. [docs/index.md](https://github.com/steindvart/dsh-loadout-manager/blob/main/docs/index.md) covers the format, HTTP archives, and update rules.

### MCP management

In Global the switch turns a server on or off in the DSH profile. In a workspace it hides the server's tools from that project's agents while the server keeps running. The Check button makes a trial connection to the server and lists its tools, even when the server is off.

### Managing from the chat

The plugin gives the agent a `loadout` tool, so you can change settings right in the conversation: for example, ask it to "turn off the omarchy skill in this project" or "which rules are on right now?". The agent can show the states of skills, rules, and MCP servers and switch them one at a time. It can also search the catalog with `action: "search"`, but installation stays on the page. Files cannot be deleted from the chat, only on the page.

## Where settings are stored

States are written to `~/.agents/loadout.json` for the global level and to `<project>/.agents/loadout.json` for a project. The source list is `~/.agents/loadout-indexes.json`. Provenance of installed copies is kept in `~/.agents/.loadout-manager/installed.json` and `<project>/.agents/.loadout-manager/installed.json`. States and sources are ordinary files that you can commit and share with your team; the provenance records what this machine installed. The plugin does not edit skill or rule files in place: an index update replaces a managed copy, and `loadout.json` only stores switches.

```json
{
  "skills": { "omarchy": "off", "tdd": "manual" },
  "rules": { "dsh/russian-docs": false },
  "mcp": { "github": false }
}
```

## Installation

The plugin supports DSH 0.2.2-rc.2 and later 0.2.x versions; it is tested on 0.2.2-rc.2. In DSH, open Plugins → Add plugin and enter the npm package name `dsh-loadout-manager`. From the DSH command line:

```sh
dsh plugin --profile <profile> add dsh-loadout-manager
```

The same form also accepts the repository's Git URL or a local checkout. The built `lib/` is committed to the repository, so there is nothing to build after cloning.

The `maxBytes` option in the plugin config limits the size of one rules message: 65536 bytes by default, and `0` turns rules off.

## Limitations

- In a session whose agent has not started yet, the `/` menu also lists skills that are off.
- Rules reach only agents whose preset includes `dsh-agent-instructions`. The Minimal preset does not.
- Deletion uses `gio trash`. Where `gio` is missing, including Windows and macOS, the file stays in place and the panel shows an error.
- Built-in skills from `app.asar` can be turned off but not deleted.
- HTTP indexes report updates by `version`; a changed file with the same version looks current. HTTP authentication is not supported, and archives need `tar` or `unzip`.
- Index entries are third-party content. The plugin validates paths and sizes and asks before replacing a locally changed copy; it does not review what a skill or rule tells the agent.

## Development

Requires Node 24 or newer.

```sh
npm install
npm run check   # lint, types, lib/ build, and tests
```

The plugin design is described in [docs/SPEC.md](https://github.com/steindvart/dsh-loadout-manager/blob/main/docs/SPEC.md), and notes on the DSH API are in [docs/research/](https://github.com/steindvart/dsh-loadout-manager/tree/main/docs/research).

## License

MIT, see [LICENSE](https://github.com/steindvart/dsh-loadout-manager/blob/main/LICENSE).

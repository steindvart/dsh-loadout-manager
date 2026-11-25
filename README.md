# Loadout Manager

English | [Русский](README_RU.md) | [中文](README_ZH.md)

A plugin for DeepSeek Harness (DSH). Stock DSH has no single page that shows which skills and MCP servers are available globally and in a given project, and it has no rules mechanism. Loadout Manager adds both: it shows skills and MCP servers by level, lets you manage them, and adds rules to the agent context next to AGENTS.md.

![The Loadout Manager page: the Skills tab in the Global scope, with an On, Manual, or Off switch for each skill](assets/main-window.png)

## Features

### Overview by level

Loadout Manager appears in the left sidebar. At the top of the page you pick a scope: Global or one of your workspaces. The Skills, Instructions, and MCP tabs show everything the agent gets in that scope, including the AGENTS.md and CLAUDE.md files DSH loads on its own. Any file opens right in its row.

### Skill management

| State | Model catalog | `/name` call |
| --- | --- | --- |
| `on` | visible | works |
| `manual` | hidden | works |
| `off` | hidden | hidden |

In `manual` mode the skill's description stays out of the context, but you can still call the skill by hand. When a skill with the same name exists both in the project and globally, the panel marks the overridden one. A skill you no longer need goes to the trash.

### Rules

A rule is a Markdown file in `~/.dsh/rules/`, `~/.agents/rules/`, or `<project>/.agents/rules/`. Enabled rules reach the agent and its subagents right after AGENTS.md, and file edits reach the agent on the next step. Each rule is switched on and off on its own.

### MCP management

In Global the switch turns a server on or off in the DSH profile. In a workspace it hides the server's tools from that project's agents while the server keeps running. The Check button makes a trial connection to the server and lists its tools, even when the server is off.

### Managing from the chat

The plugin gives the agent a `loadout` tool, so you can change settings right in the conversation: for example, ask it to "turn off the omarchy skill in this project" or "which rules are on right now?". The agent can show the states of skills, rules, and MCP servers and switch them one at a time. Files cannot be deleted from the chat, only on the page.

## Where settings are stored

States are written to `~/.agents/loadout.json` for the global level and to `<project>/.agents/loadout.json` for a project. These are ordinary files that you can commit and share with your team. The plugin never changes the skill and rule files themselves.

```json
{
  "skills": { "omarchy": "off", "tdd": "manual" },
  "rules": { "dsh/russian-docs": false },
  "mcp": { "github": false }
}
```

## Installation

The plugin is built for DSH 0.2.2-rc.2. In DSH, open Plugins → Add plugin and enter the repository directory or its Git URL. The built `lib/` is committed to the repository, so there is nothing to build after cloning.

The `maxBytes` option in the plugin config limits the size of one rules message: 65536 bytes by default, and `0` turns rules off.

## Limitations

- In a session whose agent has not started yet, the `/` menu also lists skills that are off.
- Rules reach only agents whose preset includes `dsh-agent-instructions`. The Minimal preset does not.
- Deletion uses `gio trash`. Where `gio` is missing, including Windows and macOS, the file stays in place and the panel shows an error.
- Built-in skills from `app.asar` can be turned off but not deleted.

## Development

Requires Node 24 or newer.

```sh
npm install
npm run check   # types, lib/ build, and tests
```

The plugin design is described in [docs/SPEC.md](docs/SPEC.md), and notes on the DSH API are in [docs/research/](docs/research/).

## License

MIT, see [LICENSE](LICENSE).

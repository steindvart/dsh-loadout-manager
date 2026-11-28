# Panel

The panel is global and not tied to a session. It is a left sidebar item next to Plugins and Automation tasks: the icon and label go into the `sidebar.panellist` slot (`id: 'loadout'`, `order: 20`), the page into the `main` slot with `key: 'loadout'`, in the center column in place of the chat. The layout follows the Plugins page (a column up to 960 px). The page shows one scope at a time. From top to bottom:

The header mirrors the Plugins page and stays in place on scroll: on the left the title, the subtitle, and a line with the scope path and `loadout.json`; on the right the scope picker; the tabs as the last row.

## Scope picker

A list styled as an outline button: Global, then the registered workspaces (`props.useWorkspaces(s => s.items)`). Without workspaces the list is disabled. The choice is remembered in `localStorage`.

- Global – from `$DSH_HOME/skills`, `$DSH_AGENTS_HOME/skills`, custom roots, `~/.dsh/rules/`, `~/.agents/rules/`; writes to `~/.agents/loadout.json`.
- Workspace – from `<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills`, and `<projectRoot>/.agents/rules/`, where `projectRoot` is the nearest ancestor with `.git`; writes to `<projectRoot>/.agents/loadout.json`.

## Tabs by item kind

Skills, Instructions, and MCP with item counts (`role="tablist"`, arrow keys and Home/End, `SegmentedTabs` style at size `sm`). A new kind is one entry in the `KINDS` list in `src/client/items.tsx` and one list in the `src/shared/api.ts` contract. The selected tab is remembered.

Catalog is a subpage, not a tab. The Catalog button in the header replaces the tabs with a breadcrumb (Loadout Manager / Catalog), a page title, and a Back control; the scope picker stays in place and the sidebar keeps its single Loadout Manager entry. Opening Catalog loads its own data; returning keeps the selected kind tab.

- **Instructions** shows everything that goes into the context next to the rules, in two sections in the same order: first Instruction files, that is, what `dsh-agent-instructions` loads (by default: globally `AGENTS.md` in `$DSH_HOME` and `$DSH_AGENTS_HOME`; in a workspace `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.md`, `CLAUDE.local.md` in every folder from the project root down to the workspace folder, grouped by folder), then Rules by source. Each section has a 16/600 heading with the item count and its own hint when empty. Instruction files carry an Always loaded label instead of a switch: DSH controls their loading, not `loadout.json`; they cannot be deleted. If a preset overrides the candidates in its Config, the list may differ from what the agent sees.
- **Catalog** – indexes from `~/.agents/loadout-indexes.json` and their skills and rules. The page lists sources with their title, kind, last successful read, item count, and the last error, with Refresh and Remove next to each. A form below adds a source: a git repository, an absolute local directory, or an HTTP URL to `loadout-index.json`. The entry list has a search field and is grouped by source; a row shows the name, description, version, tags, the kind, and every copy that holds the name with its level, version, update, and local-change state, the index it came from when that is another index, or a mark when no index installed it. Its controls act on the selected scope: Install, Update when the catalog reports one, or Replace when the copy is unmanaged or from another index, and a trash button for a copy an index installed. Replacing a copy and deleting a copy both ask for confirmation in the row. When each control appears and what it changes is in [catalog.md](catalog.md); sources are in [indexes.md](indexes.md).
- **MCP** – `ctx.mcpManager` servers (configured in the profile and registered by plugins), grouped by source. A row has the name, a status with a colored dot (connected, connecting, reconnecting, failed, waiting for credentials, stopped, off), the transport with the command or URL, and the last error text. Tools (N) expands the server's tools (`mcp__<server>__*` from `ctx.tools.definitions()`, the name without the prefix and the description). Check is a separate test connection through `mcpManager.probe` (up to 10 s): the server's name and version and its tool list, even for a server that is off. Restart is `mcpManager.restart`. MCP has no separate "description" field.
  - In Global the switch starts or stops the server: `servers.<name>.enabled` in the `mcp-manager` row through `ctx.settings.mutate`, the same path the DSH settings form uses. Plugin servers cannot be switched: they run while their plugin is on.
  - In a workspace the switch hides or shows the server's tools for this project's agents: `"mcp": { "<name>": false }` in the project `loadout.json`; before every agent step the plugin removes and sets `ctx.tools.restrict({ deny })` on `agent.ctx`. The server itself keeps running.
  - While the tab has connecting servers, the page rereads the state every 2 s.

## List of the selected kind

Grouped by source: above each group a 14/500 heading with the item count, the rows themselves in a card (`--dsw-alias-settings-card-fill` / `-stroke`, as in the Models and Agent presets sections). On the right of a row: Open, a 28×28 delete button, and the switch; the delete confirmation and the file text appear under the row.

Confirmations here and in the Catalog behave the same. The question with its Cancel and confirm buttons is an alert dialog named by the question. Opening it moves focus to Cancel, Escape cancels it, and closing it returns focus to the button that opened it, if that button is still on the page. That button stays enabled while the confirmation is open; only a running operation disables it.

The panel derives custom roots from the `path` of registry candidates with `source: 'custom'` (the default preset scope, `acquireScope()`) and scans those roots with its own scanner, so overridden duplicates show too. Custom skills are global. Files inside `app.asar` (`dsh-doc`, `office*`) are read-only: they can be switched but not deleted.

A row has the name and description (from frontmatter), the version for a skill when present (`metadata.version` per the Agent Skills format, otherwise top-level `version`), the path, the switch (three-way for a skill), Open, and Delete.

- Open: the file text expands right in the row (the Host reads it). The right preview pane is unavailable: while the page occupies the center column, no session is on screen.
- Delete: confirmation in the row itself, then `gio trash -- <path>` on the Host. When `gio` fails or is missing (Windows, macOS), the Host moves the entry into `$DSH_HOME/.trash/<UTC time>/<name>` (`~/.dsh/.trash` by default) and returns the new path; the page names it in a notice above the list, since the row itself is gone. Across drives the entry is first renamed into a `.loadout-trash-<uuid>` folder next to its root, on its own drive, so it leaves the scanned root in one step; it is then copied into `.trash`, and the staged original is removed only after the copy succeeds. A failed copy puts the entry back. If the staged original cannot be removed, the entry is already in `.trash`, the page refreshes, and the error names the leftover folder to delete by hand. If the move fails too, show an error and do not delete permanently. The plugin never empties `.trash`; DSH does not scan it.

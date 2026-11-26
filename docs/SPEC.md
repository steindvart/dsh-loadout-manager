# dsh-loadout-manager – specification

A DSH plugin that manages the agent's _loadout_: which skills and rules it carries. The loadout lives in the project's `.agents/` and in the home directories. The plugin has a Host part (skill catalog filter, rules injected into the context, the index catalog) and a Client part (the management panel in the Web GUI). The Catalog subpage installs skills and rules from indexes the user configures.

Status: the first version and the Catalog are installed and verified on a live DSH. Notes on the DSH API gathered for the implementation are in [research/](research/).

## Topics

The specification is split by topic; each file covers one part of the plugin:

- [Skills](skills.md) – the `on`/`manual`/`off` states, deletion, the filter through a shadow provider in the agent layer.
- [Rules](rules.md) – format, roots, injection into the context after the AGENTS.md pattern, budget.
- [Skill and rule indexes](indexes.md) – sources, `loadout-index.json` (format 1 paths, format 2 npm packages), requirements for entries, cache and refresh, reading a source.
- [Catalog](catalog.md) – installing, updating, and deleting index entries, provenance, checks before an install, agent search.
- [On/off state](loadout.md) – `loadout.json`: levels, format, addressing, overriding of same-name skills.
- [Panel](panel.md) – scope picker, tabs (Skills / Instructions / MCP), the list of the selected kind.
- [Host operations](host-operations.md) – the `/api/dsh-loadout-manager/<op>` routes and the `loadout` tool.
- [Code and build](build.md) – TypeScript/tsdown, `lib/`, the `src/shared/api.ts` contract.

Facts about the DSH 0.2.2-rc.2 API with links to the sources are in [research/](research/); the topic files do not repeat them.

## Extension rules

From `dsh-doc` → `references/practices.md`:

- Everything the model sees must be reconstructible from the session log. Do not add new event `type`s.
- Add to the agent context through `agent.inject()` (logged as `agent/inbox/spliced`) or through the `agent/pre-step` decision. When you rewrite the `decision`, spread it whole. Leave `system-prompt/assemble` alone.
- Register per-agent behavior on `agent.ctx` from `agent/created`.
- UI: React components in slots, only the `--dsw-alias-*` theme tokens, own controls instead of importing `dsh-client-ui-primitives`. The reference for a list is the Plugin Manager page.

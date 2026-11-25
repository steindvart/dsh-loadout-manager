# Skills

The panel shows skills from every root that `dsh-skill-filesystem` scans (table below), including `<projectRoot>/.dsh/skills` and custom roots (`customSkillDirs`, built-in skills from `app.asar` among them), grouped by source. How they split into global and workspace skills is described in [panel.md](panel.md).

## States

Every skill has three states:

- `on` – as today: in the model catalog and in the `/` menu;
- `manual` – hidden from the model catalog (stays out of the request context), but invoked by hand through `/name`;
- `off` – hidden everywhere.

A skill whose frontmatter already sets `disable-model-invocation: true` shows as `manual` and cannot be raised above `manual`: the file is the source of truth.

Deletion moves the `<name>/` directory or the `<name>.md` file to the trash after confirmation in the UI.

## Skill filter: a shadow provider in the agent layer

The plugin leaves skill files untouched. In the `agent/created` listener (which also receives subagents) it registers a provider on `agent.ctx.skills` – the agent layer, which sits closer than the preset layer. The disposer is also held in the plugin's effect. For each skill whose `loadout.json` narrows the file's policy, the provider returns a candidate with the same `name`, `description`, `whenToUse`, `source`, and the policy:

- `manual` → `{ modelInvocable: false, userInvocable: true }`; `get()` takes the original from the registry and returns it with our policy and `provider`;
- `off` → `{ modelInvocable: false, userInvocable: false }`; `get()` returns `undefined`.

The originals for `list()` and `get()` are read from the registry with the agent's preset scope: `ctx.agentPresets.acquireScope(composedPreset(agent.ctx))` → `ctx.skills.list/get({ cwd, scope: lease.key })`. The `[presetKey]` chain does not include the agent layer, so there is no recursion. This also covers custom skills whose roots the plugin does not know. The `loadout.json` level is chosen by the winner's `source`: `project-*` is the project level, everything else is global.

The model catalog updates the standard way: `dsh-tool-skill` compares the digest on the next `pre-step` and appends the new catalog. After `loadout.json` changes (panel, tool, `fs/observed`), the plugin calls `invalidate()` on every live provider.

DSH limitation: the `/` menu of a session whose agent has not been created yet reads the registry without the agent layer and shows `off` skills.

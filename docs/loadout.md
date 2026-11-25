# On/off state – `loadout.json`

The state is kept in files rather than in the DSH profile, so it can be committed and shared with a team:

- `<projectRoot>/.agents/loadout.json` – project skills and rules (the project's `.dsh/skills`, `.agents/skills`, `.agents/rules`);
- `~/.agents/loadout.json` – global skills and rules (`$DSH_HOME/skills`, `$DSH_AGENTS_HOME/skills`, `customSkillDirs`, `~/.dsh/rules`, `~/.agents/rules`).

Each file controls only the items of its own level: the project file cannot turn off a global skill or rule, and the other way round. A missing entry means "on". Format sketch (global file):

```json
{
  "skills": { "omarchy": "off", "tdd": "manual" },
  "rules": { "dsh/russian-docs": false, "agents/commit-style": true }
}
```

Skills are addressed by name, rules as `<source>/<file>` (`project`, `dsh`, `agents`), because the global level has two rule roots and same-name files in them are different rules.

When a same-name skill exists both in the project and globally, DSH picks one by rank (see the root table in [skills.md](skills.md)). The skill's state comes from the `loadout.json` of the level where the winning candidate lives. Turning off the losing one has no effect, and the panel marks it as overridden.

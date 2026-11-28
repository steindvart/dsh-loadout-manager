# Rules

A rule is a flat `<file>.md` file in a rule root (as in Kilo Code). Frontmatter is optional; when present, the panel takes `name` and `description` from it, as for skills. Without frontmatter the name is `<file>` and there is no description. The model's context gets the file body without frontmatter.

The rule identifier (its key in `loadout.json`) is built from the file name rather than from the frontmatter `name`, so renaming in frontmatter does not reset the state.

## Rule roots

| Level | Path |
|---|---|
| project | `<projectRoot>/.agents/rules/` |
| global | `~/.dsh/rules/` (`$DSH_HOME/rules`) |
| global | `~/.agents/rules/` (`$DSH_AGENTS_HOME/rules`) |

Each rule is switched on and off on its own and is moved to the trash after confirmation, or into `$DSH_HOME/.trash` when there is no system trash (see [panel.md](panel.md)). A rule is on by default.

Enabled rules enter the request context on a par with AGENTS.md: the same `<system-reminder>` format, the same priority ("workspace instructions"), a separate message right after the `dsh-agent-instructions` baseline.

Subagents get rules the same way as the main agent. During implementation, check how `dsh-agent-instructions` delivers AGENTS.md to child agents and follow the same path.

Installing rules (creating them in the UI, import, URL) is out of the first version: files are placed by hand.

## Rules in the context

The mechanism mirrors `dsh-agent-instructions` and works only for agents whose composition includes it: `ctx.agentPresets.inspectCompositions(agent.ctx)` contains the `@deepseek-ai/dsh-agent-instructions` module.

- An `agent/pre-step` listener (waterfall): `await next()` first; on `reject` and on an empty first step the decision is returned unchanged.
- On the first eligible step – a baseline with every enabled rule (`dsh` first, then `agents`, then `project`). It is inserted right after the last `agent-instructions` message, otherwise after the last claimed message; the decision is spread.
- On every step the rules are checked again (`stat` + digest, no watcher needed). The difference from what was seen is one message with `Additional rule from` / `Updated rule from` / `Rule removed` sections.
- The message is a `user/message` with `source: { kind: 'dsh-loadout-manager-rules', form: 'instructions', baseline?: true, projectRoot, snapshot }`, where `snapshot` is `{ displayPath: digest }` after this message. The state is restored from the last such message on the session surface (`session.deriveMessages()`), so replay, resume, fork, and compaction work without separate storage. A change of `projectRoot` means a new baseline.
- `displayPath`: `~/.dsh/rules/<file>.md`, `~/.agents/rules/<file>.md`, project rules relative to `projectRoot`.
- The `maxBytes` budget (Config, 65536 by default) applies per message: the broadest rules are dropped first, then the last one is truncated, and a `Rule budget N bytes: …` marker goes at the start. Dropped rules are recorded in the snapshot as `omitted:<digest>` and are not repeated until they change.

Baseline template (text for the model, in English, like AGENTS.md):

```markdown
<system-reminder>
The following rules apply to your work. Treat them like workspace instructions: more specific rules take precedence over broader ones, and they do not override system, developer, or direct user instructions.

Rule from: ~/.dsh/rules/<file>.md

<rule body without frontmatter>

Rule from: .agents/rules/<file>.md

<rule body without frontmatter>
</system-reminder>
```

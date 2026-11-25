# The DSH Host API for dsh-loadout-manager

A check of the facts [SPEC.md](../SPEC.md) relies on, against the sources of the installed DSH 0.2.2-rc.2 (Desktop). The version is confirmed by `dsh/node_modules/@deepseek-ai/dsh/package.json`.

Path abbreviation: `$P` = `/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai`. Files inside the ASAR are read with the read tool or through `ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE"`. Line numbers refer to those files. Live service signatures were also checked through `cordis_inspect_query` (Host `Service.listService`). Requests with an `input` parameter were rejected in that session (`"input" must be an object`), so the Config of mounted plugins could not be read through Inspect.

The most important point is in section 1.4: in Desktop, a shadow provider registered from a bundle's `apply(ctx)` **does not override** the `dsh-skill-filesystem` skills.

## 1. `ctx.skills.registerProvider`

Source: `$P/dsh-skill/src/index.ts`.

### 1.1. Types

```ts
// :247-267
interface SkillProvider {
  readonly name: string                       // unique within a layer
  readonly list: (options: SkillLookupOptions) =>
    Promise<readonly SkillCandidate[] | SkillProviderObservation>
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) =>
    Promise<SkillDefinition | undefined>
}
// :270-275
interface SkillProviderControl {
  readonly signal: AbortSignal   // aborted when the registration is removed
  readonly invalidate: () => void
}
// :103-119
interface SkillLookupOptions { cwd?: string; signal?: AbortSignal }
interface SkillViewOptions extends SkillLookupOptions { scope?: ScopeKey }
// :239-244
interface SkillProviderObservation { candidates: readonly SkillCandidate[]; complete: boolean }
```

A candidate (`:57-84`) is a `SkillSummary` plus provider fields:

| Field | Type | Required and validated (`validateCandidate`, `:707-739`) |
|---|---|---|
| `name` | string | kebab-case: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |
| `description` | string | non-empty |
| `whenToUse` | string | optional |
| `invocation` | `{ modelInvocable: boolean, userInvocable: boolean }` | both fields boolean. The validator lets `undefined` through, but `toSummary` copies it as is and consumers read `skill.invocation.modelInvocable`, so always set it |
| `source` | string | any string: `project-dsh`, `project-agents`, `runtime`, `user-dsh`, `user-agents`, `custom`, `bundled`, or your own |
| `provider` | string | must match `provider.name`, otherwise an error |
| `rank` | number | a finite number, lower wins |
| `locator` | unknown | an opaque handle returned to `get()` |
| `path` | string | optional, absolute file path |
| `resourceBase` | `{kind:'directory',path}` \| `{kind:'url',url}` \| `{kind:'opaque',description}` | optional |
| `metadata` | object | optional |

`get()` returns a `SkillDefinition` = `SkillSummary` + `content: string` (+ `metadata`). The registry validates the definition (`validateDefinition`, `:748-767`). If `definition.name !== candidate.name`, the registry invalidates the cache and returns `undefined` (`:512-515`).

### 1.2. Synchronicity and arguments

- The factory in `registerProvider(create)` is synchronous: "Register a borrowed same-process provider synchronously during plugin apply" (`:380-390`). It returns a Cordis effect disposer.
- `list()` and `get()` are asynchronous and must return a Promise (`waitWithAbort(provider.list(options), …)`, `:603`).
- `list()` receives the same options object the registry consumer passed: `{ cwd, signal, scope }`. The provider contract covers only `cwd` and `signal` (`:110-115`), but `scope` is physically in the object. `cwd` is the session working directory: `dsh-tool-skill` gets it through `ctx.workingDirectory.ensure(agent)`, and `scope` is the `Agent` object itself (`$P/dsh-tool-skill/src/index.ts:136-137, 190, 226`). The registry does not pass `projectRoot`; the provider computes it itself.
- The name `runtime` is reserved (`:406-408`). A duplicate provider name in one layer throws (`:334-336`).

### 1.3. Cache and `invalidate()`

`collect()` caches the result by the key `{cwd, scopes: chain ids, revision}` (`:519-549, 643-645`), up to 128 entries. `invalidate()` works only while this particular registration is alive (`:396-401`) and calls `invalidateCache()`: `revision += 1`, cache cleared, a `skills/change` event (`:621-625, 648-659`). Registering and removing a provider also invalidate the cache (`ScopedLayers.effect` → `onChange`, `$P/dsh-scope/src/store.ts:226-266`). Incomplete observations (`complete: false`) are not cached.

Without an `invalidate()` call the registry will not reread the provider for the same `cwd`: a change to `loadout.json` must end with `invalidate()`.

### 1.4. Layers and where a bundle's provider lands

The registry is layered (`:345-355`): a global layer plus a layer per scope. A registration lands in the layer of the calling context's scope (`scopeOf(ctx)`, `$P/dsh-scope/src/store.ts:231-247`). Reading assembles the layers like this:

```ts
// $P/dsh-skill/src/index.ts:551-565
const layers = [this.layers.global, ...this.layers.chainLayers(options.scope)]
const merged = new Map<string, IndexedCandidate>()
for (const layer of layers) {
  const collected = await this.collectLayer(layer, options)
  ...
  for (const entry of collected.entries) merged.set(entry.candidate.name, entry)
}
```

The global layer comes first, then the scope chain from the farthest ancestor to the nearest. A same-name candidate from a nearer layer replaces a farther one **entirely, regardless of rank**. Rank is compared only within a single layer.

An agent's scope chain: `[agent, presetGeneration]`. The agent is its own scope key (`createScope(loopCtx, this)`, `$P/dsh-agent-loop/src/agent.ts:148`; `agentCarrier`, `$P/dsh-agent/src/dispatch.ts:94-96`). The parent is set to the preset revision key (`bindScopeParent(key, generation.key)`, `$P/dsh-agent-preset-registry/src/index.ts:281-290`). Preset plugins are mounted in the `createScope(this.owner, key)` context (`:119-127`), so they register into the preset layer.

Where `dsh-skill-filesystem` is mounted in Desktop:

- `dsh-base` inserts the `skill-filesystem` host row (`$P/dsh-base/cordis.patch.yml:315-316`);
- `dsh-web-app` **disables** it: "the base host `skill-filesystem` row is disabled here (presets own local discovery)" (`$P/dsh-web-app/cordis.patch.yml:542-552`); `tool-skill` and `agent-instructions` are disabled the same way (`:554, 604`);
- the `standard`, `ptc`, and `cordis` presets mount their own `skill-filesystem` inside `config.plugins` (`$P/dsh-web-app/presets/standard.patch.yml:40-44`, `ptc.patch.yml:40-41`, `cordis.patch.yml:126-130`). The `minimal` preset mounts neither skills nor `agent-instructions`.

A profile bundle (`dsh.profile.bundles`, like `dsh-better-sidebar`) inserts a row into the root tree. Its `apply(ctx)` gets a context without a scope, and the provider lands in the **global** layer. `skill-filesystem` lives in the **preset layer**. The preset layer is nearer, so the original from `skill-filesystem` replaces our rank 50 candidate at any rank. The shadow approach from the SPEC does not work in this form.

The working option is to register the provider in the **agent** layer, which is nearer still than the preset layer:

```js
ctx.on('agent/created', ({ agent }) => {
  // agent.ctx carries scope = agent; the service's this.ctx is swapped for the calling context
  const dispose = agent.ctx.skills.registerProvider(control => makeProvider(agent, control))
  // per practices.md: also hold the disposer in your own effect
})
```

Why this works:
- `agent/created` is a serial event awaited before the message queue is released, that is, before the first `pre-step` (`$P/dsh-agent/src/runtime-types.ts:280-291`). A listener without a scope receives the events of every agent, subagents included (`scopeTarget`: "admits untagged listeners globally", `$P/dsh-scope/src/index.ts:158-185`).
- Calling the service through `agent.ctx.skills` substitutes `agent.ctx` into `this.ctx` (tracker `{ associate: name, property: 'ctx' }`, `$P/cordis/src/service.ts:46-55`). `register()` works the same way and explicitly relies on `scopeOf(this.ctx)` (`$P/dsh-skill/src/index.ts:439-460`).
- `practices.md`: "Register per-agent behavior on `agent.ctx`, obtained in an `agent/created` listener… keep that disposer, keyed by agent, in your plugin's own effect".

I did not run a registration into the agent layer on the live runtime: **not verified**.

Limitation: the Remote `skills/list` (the `/` menu) of a **non-live** session reads the registry with the preset revision scope, without the agent layer (`$P/dsh-api-session-controller/src/skill-catalog.ts:63-78`). Until the session is activated, the `/` menu also shows `off` skills. Once the agent is created, `scope = live` is used and the shadow takes effect.

### 1.5. Deduplication (code)

```ts
// $P/dsh-skill/src/index.ts:567-582
private async collectLayer(layer, options) {
  const collected = await this.listLayerCandidates(layer, options)
  collected.entries.sort(compareIndexedCandidates)
  const seen = new Set<string>()
  const result: IndexedCandidate[] = []
  for (const entry of collected.entries) {
    const skill = entry.candidate
    if (seen.has(skill.name)) {
      this.ctx.logger.warn(`skill "${skill.name}" from ${skill.source} ignored because a higher-priority skill already exists`)
      continue
    }
    seen.add(skill.name)
    result.push(entry)
  }
  ...
}
// :807-811
function compareIndexedCandidates(left, right) {
  return left.candidate.rank - right.candidate.rank
    || left.providerOrder - right.providerOrder   // global provider registration counter
    || left.localOrder - right.localOrder         // order within one provider's list()
}
```

Runtime skills (`ctx.skills.register`) come with `rank 250` and `providerOrder -1` (`:589-598`). Within a layer the order is rank, then provider registration order, then the order in its `list()`. Deduplication within a layer comes first, then overriding across layers.

## 2. Does a non-invocable candidate hide the original

Yes, if it is in the same or a nearer layer. The registry ignores `invocation` both in deduplication (code above) and in layer assembly: "exposes sorted invocation-neutral summaries" (`:345-355`), "Consumers apply model or user invocation policy at their operational boundary" (`:462-468`). Filtering happens after the winner is chosen:

- the model catalog: `snapshot.skills.filter(isModelInvocable)` (`$P/dsh-tool-skill/src/index.ts:226-229`);
- the `skill` tool: `list()` → winner → `if (!isModelInvocable(summary)) throw` (`:138-144`), then again on the definition after `get()` (`:145-151`);
- the `/` menu: `(await skillRegistry.list({ cwd, scope })).filter(isUserInvocable)` (`$P/dsh-api-session-controller/src/skill-catalog.ts:78`).

So `{modelInvocable:false, userInvocable:false}` wins deduplication and hides the original everywhere. For `{modelInvocable:false, userInvocable:true}`:

```ts
// $P/dsh-tool-skill/src/index.ts:190-205  (the `/name` gesture in pre-step)
const lookup = { cwd: await ctx.workingDirectory.ensure(agent, signal), signal, scope: agent }
for (const name of names) {
  const skill = await ctx.skills.get(name, lookup)
  if (skill === undefined || !isUserInvocable(skill)) continue
  ...createUserMessage({ content: [{ type: 'text', text: renderSkillContent(skill) }],
                         source: { kind: 'skill-invocation', name, form: 'instructions' } })
}
// $P/dsh-skill/src/index.ts:500-517
async get(name, options) {
  const collected = await this.collect(options)
  const match = collected.entries.get(name)          // the winner
  const definition = await waitWithAbort(match.provider.get(match.candidate, options), options.signal)
  ...
}
```

`/name` calls the winning provider's `get()`, that is, ours. The `isUserInvocable` check runs on the **definition** our `get()` returned, so it must carry `invocation: { modelInvocable: false, userInvocable: true }`. For `off`, our `get()` may return `undefined`.

For `manual` there is no need to parse the body ourselves. Inside the agent-layer provider, call the registry with the preset revision scope: the `[presetKey]` chain does not include the agent layer, so there is no recursion. This yields the original from `skill-filesystem` with the same parser and roots:

```js
const lease = await ctx.agentPresets.acquireScope(ctx.agentPresets.composedPreset(agent.ctx))
try {
  const originals = await ctx.skills.list({ cwd, scope: lease.key })          // for list()
  const original  = await ctx.skills.get(name, { cwd, scope: lease.key })     // for manual get()
} finally { await lease[Symbol.asyncDispose]() }
```

The installed `dsh-context` does this (`serviceFor`/`acquireScope` in the `/api/dsh-context/skills` route). Caveat: `acquireScope(id)` returns the **current** preset revision, while the agent may have stayed on an old one after a preset edit (`$P/dsh-agent-preset-registry/src/index.ts:389-398`). For the stock presets this is rare. A revision mismatch was **not verified**.

## 3. `dsh-skill-filesystem`

Source: `$P/dsh-skill-filesystem/src/index.ts`.

### 3.1. Roots, projectRoot, cwd

`roots(cwd)` (`:251-271`) is recomputed on **every** `list()` call:

| Rank | source | Path | Condition |
|---|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` | `includeDefaultRoots && cwd !== undefined` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` | same |
| 300 | `custom` | each `customSkillDirs[i]` | always |
| 400 | `user-dsh` | `<dshHome>/skills`, skips `.system` | `includeDefaultRoots` |
| 500 | `user-agents` | `<agentsHome>/skills` | `includeDefaultRoots` |
| 600 | `bundled` | `bundledSkillDir` or `$DSH_BUNDLED_SKILL_DIR` | when set |

`projectRoot = findProjectRoot(resolve(cwd), ctx.fs)` (`:959-969`): the nearest ancestor where `.git` exists (file or directory, checked with `stat`), otherwise `cwd` itself. `cwd` comes from `options.cwd`. Without `cwd` (for example, a read without a session) there are no project roots.

`DSH_BUNDLED_SKILL_DIR` is not set in the Host process (checked through `/proc/<pid>/environ`). In the `standard`, `ptc`, and `cordis` presets `customSkillDirs` contains the `skills` directory of the `@deepseek-ai/dsh-agent-preset` package inside `app.asar` – this is how `dsh-doc` arrives with `source: 'custom'`. The panel must show such skills as read-only: they cannot be deleted.

A skill is `<root>/<name>/SKILL.md` (a directory or a symlink to a directory) or `<root>/<name>.md`, top level only (`discoverRoot`, `:737-765`). Reads go through `ctx.fs` when the service exists, otherwise through `node:fs`.

### 3.2. Frontmatter

```ts
// :931-943
function parseFrontmatter(raw) {
  const firstLine = raw.slice(0, raw.indexOf('\n')).replace(/\r$/, '')
  if (firstLine !== '---') return undefined
  ... findClosingFrontmatter: a line that is exactly '---' (CR allowed)
  const parsed = parseYaml(yaml)          // import { parse as parseYaml } from 'yaml'
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return { data: parsed, body: raw.slice(closing.bodyStart) }
}
```

The parser is the full `yaml` npm package: block scalars, quoting, and the rest of YAML 1.2 are supported. A file without frontmatter, with invalid YAML, without non-empty string `name`/`description`, or with a non-kebab-case `name` is skipped with a warning (`:811-854`). The body is `parsed.body.trim()`. Optional fields: `whenToUse` (string), `metadata` (object).

Invocation (`:1014-1051`):

```ts
rejectLegacyInvocationKey(data, 'disableModelInvocation', 'disable-model-invocation')
rejectLegacyInvocationKey(data, 'modelInvocable', 'disable-model-invocation')
rejectLegacyInvocationKey(data, 'userInvocable', 'user-invocable')
const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation')
const userInvocable = frontmatterBoolean(data, 'user-invocable')
return { modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false }
```

`frontmatterBoolean` accepts booleans, `1`/`0`, `'1'`/`'0'`, `true/yes/on`, `false/no/off` case-insensitively. Any other value is an error, and the skill is skipped. A camelCase key (`disableModelInvocation` and so on) also gets the skill skipped.

### 3.3. `customSkillDirs`

```ts
// :168
this.customSkillDirs = (config.customSkillDirs ?? []).map(root => resolve(root))
```

The paths are resolved **once in the constructor** through `path.resolve`, that is, against the Host process's `process.cwd()`. That is neither the session cwd nor projectRoot. The Desktop Host process's cwd is the profile directory `~/.dsh/profiles/desktop` (`readlink /proc/<host-pid>/cwd`). `~` in `customSkillDirs` is **not expanded** (unlike `dshHome`/`agentsHome`, which go through `expandHomePath`). So custom roots are always global and have nothing to do with the project `loadout.json`.

### 3.4. How to read another plugin's Config

Plugins have no public API for "read the mounted Config of plugin X":
- `ctx.configEditor.configuration()` and `entries()` return rows of the Host tree only (signatures from Inspect), and the `skill-filesystem` row is disabled in the Host;
- `ctx.agentPresets.readDocument(id)` is a Remote that returns a YAML dump of the preset's `plugins` with **unevaluated** `!!js` (`$P/dsh-agent-preset-registry/src/index.ts:233-246`). The stock `customSkillDirs` is exactly a `!!js` expression;
- `compositionInventory()` returns rows without config (`composition-inventory.ts`);
- `references/configuration.md` forbids reading the profile's `cordis.patch.yml`. Besides, the final config is assembled from several layers.

Conclusion: do not read the config. Take the skill list, custom and bundled included, from the registry: `ctx.skills.list({ cwd, scope: presetKey })` returns the winners with `source` and `path` (section 2). The registry does not return overridden same-name candidates. For the panel to show "overridden" ones, scan the standard roots (`project-*`, `user-*`) yourself and derive the custom roots from the `path` of candidates with `source: 'custom'`.

The stock presets set no `dshHome`/`agentsHome` overrides, so `$DSH_HOME`/`$DSH_AGENTS_HOME` apply (section 9).

### 3.5. File watching

The provider watches its roots itself through chokidar (`depth: 1`, `SkillWatchManager`, `:294-615`) and listens to `fs/observed` from the `edit`/`write` tools (`:142-145`). On changes it calls `invalidate()`. Our plugin does not have to track skill file changes. After invalidation the registry calls our `list()` again too.

## 4. `dsh-tool-skill`: digest and the reaction to `invalidate()`

Source: `$P/dsh-tool-skill/src/index.ts`.

- The `agent/pre-step` listener (`:217-255`) takes `ctx.skills.snapshot({ cwd, signal, scope: agent })` on **every** step and filters by `isModelInvocable`. The catalog is published only when the agent sees exactly this `skill` tool (`ctx.tools.get('skill', agent) === skillTool`).
- Digest (`:347-355`): sha256 over `JSON.stringify([name, description])` lines, where the description is normalized (whitespace collapsed, cut to `catalogDescriptionMaxLength = 500`), prefixed with `incomplete\n` when discovery is incomplete.
- The visible digest comes from the last `user/message` event with `source.kind === 'skill-catalog'` still on the session surface (`catalogHistory`, `:381-398`). If the digest matches, nothing is added. If it differs and the catalog was already published, a new message "The available skill catalog changed. This complete catalog replaces every earlier available-skills list…" is added with `source.update: true` (`:289-327`). Old messages are not rewritten: append-only, the KV cache is preserved.
- The tool is not subscribed to `skills/change`. The reaction to `invalidate()` happens on the next `pre-step`: the registry cache is reset, `snapshot` is rebuilt, the digest is compared. Nothing happens between steps.

## 5. `dsh-agent-instructions`

Sources: `$P/dsh-agent-instructions/src/{index,state,render,config,files,digest}.ts`.

### 5.1. Where it lives and how it reaches subagents

In Desktop the host row is disabled (`$P/dsh-web-app/cordis.patch.yml:604-605`); the plugin is mounted inside the `standard`/`ptc`/`cordis` presets with `maxBytes: 65536` (`presets/standard.patch.yml:15-18`). Its `ctx.on('agent/pre-step')` is registered on the preset context. Such a listener receives the events of every agent whose scope chain contains the preset key (`scopeTarget`, `$P/dsh-scope/src/index.ts:158-185`).

Subagents join the same preset revision (`composeFrom`, `$P/dsh-agent-preset-registry/src/index.ts:313-327`; called from `$P/dsh-subagent/src/child-agent.ts:201`). They have their own `pre-step`, and the plugin inserts its baseline into **their** session. The plugin does not listen to `agent/created`. Per-agent state is only a cache: `WeakMap<Session, …>` (file versions, the prepared baseline). The source of truth is the session surface.

A fork gets the parent's history, baseline included. The plugin finds it on the surface and does not insert it again (`visibleBaselineSource`, `index.ts:47-64`).

For dsh-loadout-manager: an `agent/pre-step` listener in the bundle's `apply(ctx)` (no scope) will get the pre-step of **every** agent of every preset, including `minimal`, which has no `agent-instructions`. If rules should go only where AGENTS.md goes, a check is needed, for example `ctx.agentPresets.inspectCompositions(agent.ctx)` for the `@deepseek-ai/dsh-agent-instructions` module (signature from Inspect; not verified).

### 5.2. The pre-step decision

```ts
// index.ts:330-356
ctx.on('agent/pre-step', async ({ agent, messages, step, signal }, next) => {
  const decision = await next()
  await waitForProjections(agent)
  const pending = agent.inbox.nextStep.filter(isAgentInstructionsMessage)
  const desired = await compose(agent, signal, messages, pending)
  if (decision.kind === 'reject' || (step === 1 && decision.messages.length === 0)) {
    syncInbox(agent, messages, desired)       // leave the context waiting in the inbox
    return decision
  }
  for (const message of pending) agent.inbox.remove(message.id)
  if (desired === undefined || decision.messages.some(m => sameContextPayload(m, desired))) return decision
  const lastClaimedIndex = decision.messages.findLastIndex(m => messages.includes(m))
  const entered = decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired)
  return { ...decision, messages: entered }
})
```

Decision type (`$P/dsh-agent/src/runtime-types.ts:139-146`): `{ kind: 'reject' } | { kind: 'enter', messages: UserMessage[], startsRequestSeries?: true }`. The `agent/pre-step` event, waterfall mode (`:339-351`).

The message is inserted right after the last "claimed" user message, before the runtime context and the skill catalog. The `dsh-tool-skill` catalog is appended at the end, and so is the `/name` gesture.

I did not check the order between our root listener and the preset listener in the waterfall chain. A reliable insertion point is after the last message with `source.kind === 'agent-instructions'` if there is one, otherwise after the last claimed message. If our listener turns out to be the inner one, `agent-instructions` inserts its message at `lastClaimedIndex + 1` before ours, and the order still comes out right.

### 5.3. Message shape and marker

The message is created by `createUserMessage` (`$P/dsh-llm/src/message.ts:221-253`): `{ id: randomUUID(), role: 'user', content, source }`, deep-frozen. In plain JS:

```js
const msg = Object.freeze({
  id: crypto.randomUUID(), role: 'user',
  content: [Object.freeze({ type: 'text', text })],
  source: Object.freeze({ kind: 'dsh-loadout-manager-rules', form: 'instructions', baseline: true, changes: [...] }),
})
```

Source (`state.ts:40-49`):

```ts
interface AgentInstructionSource {
  kind: 'agent-instructions'
  form: 'instructions'          // ContextForm: semantics for the UI
  baseline?: true               // a full baseline, not a delta
  baselineIdentity?: string     // JSON {projectRoot (relative to cwd), markers, maxBytes, …}
  changes: { action: 'set'|'replace'|'remove', scope: string, path: string, digest?: string }[]
}
```

`MessageSourceMap` is extensible, and a `kind` of your own is allowed: "each producer declares its own `kind`… consumers fall through unknown kinds" (`message.ts:103-115`). Using `kind: 'agent-instructions'` is not an option: the plugin collects `changes` from every message of that kind and removes them from the inbox (`state.ts:140-161`, `index.ts:66-68`).

How "already inserted" is determined (replay, resume, compaction):
- baseline: the last claimed message with `source.baseline === true`, otherwise a backward walk over `agent.session.surface.nodes` looking for a `user/message` with `source.kind === 'agent-instructions' && baseline === true` (`index.ts:47-64`). If `baselineIdentity` does not match (cwd/projectRoot/config changed), a replacement baseline is inserted with the intro "This complete workspace instruction baseline replaces all earlier…" and `remove` for the scopes that disappeared (`index.ts:139-205`, `render.ts:21-24`);
- the effective file state is the last `change` for each `scope` across every visible message of that kind (`visibleInstructionChanges`, `state.ts:140-161`);
- `syncInbox` does not insert again when the same payload (`content` + `source`, `isDeepStrictEqual`) is already among the claimed messages or on the surface (`index.ts:245-270`).

Only the surface (`surface.nodes`) is read: after compaction, if the baseline dropped off the surface, it is inserted again.

`session.eventAt(seq)` is marked in the source as `@deprecated … new calls are prohibited` (`$P/dsh-session/src/index.ts:738-747`). New code has the non-deprecated `session.deriveMessages()` – a cached array of the surface's visible messages with `source` (`:1079-1100`).

### 5.4. Updates and removals

There is no watcher. On **every** `pre-step` `compose()` calls `reconcileInstructionContext` over all baseline scopes (the global `AGENTS.md` and the chain from projectRoot to cwd over all candidates). Each file gets an `fs.stat` (`version` metadata). If the version matches the cache and the digest matches the visible one, the file is not reread (`state.ts:251-456`). So an AGENTS.md edit made by any means is detected on the next step. The `read`/`write`/`edit` tools (`tools/result`, `index.ts:358-374`) only serve to add **nested** scopes between cwd and the touched file. Touches inside an open step are deferred to `step/end` and projected into the inbox through `agent.inbox.prepend('next-step', …)`.

The SPEC says an update arrives "after tools touch the files". That is incomplete: baseline files are rechecked with stat on every step.

Delta texts (`render.ts:226-270`):

```text
Additional instructions from: <path>

These instructions apply to work under `<scope>`. | These user-global instructions apply to all work. Use them as guidance when relevant; more specific instructions take precedence. They do not override system, developer, or direct user instructions.

<content>
```
```text
Updated instructions from: <path>

This file changed after it was loaded. Use the following content instead of the previously loaded instructions from this file.

<content>
```
```text
Instructions removed: <path>

The previously loaded instructions from this file no longer apply.
```

A delta batch has an empty intro, with the sections in a single `<system-reminder>` frame.

### 5.5. Baseline format

```ts
// render.ts:16-20, 100-102, 315-327
const AGENT_INSTRUCTIONS_INTRO = 'The following workspace instructions may be relevant to your work. '
  + 'Use them as guidance when applicable. More specific instructions take precedence over broader ones. '
  + 'They do not override system, developer, or direct user instructions.'
sectionText = `Instructions from: ${file.displayPath}\n\n${file.content}`
text = ['<system-reminder>', escape([marker, intro, ...sections].filter(nonEmpty).join('\n\n')), '</system-reminder>'].join('\n')
escape: body.replaceAll('</system-reminder>', '<\\/system-reminder>')
```

`displayPath`: global ones are `~/.dsh/AGENTS.md` or `$DSH_HOME/AGENTS.md`, `~/.agents/AGENTS.md` or `$DSH_AGENTS_HOME/AGENTS.md` (`files.ts:91-97, 337-343`, `dshHomeDisplay`). Project ones are paths relative to projectRoot (`relativeDisplay`). Order: the global chain first (`$DSH_HOME` → `$DSH_AGENTS_HOME`), then the project chain from the root down to cwd. File content is inserted as is, without trim (`readBounded`, `files.ts:387-417`). Trim is used only for the duplicate digest. The digest in `changes` is the sha1 of the raw content (`digest.ts:14-15`).

### 5.6. `maxBytes`

`maxBytes` (a required Config field, 65536 in the presets) is a UTF-8 byte limit **per** chain (user-global and project) in one baseline or delta batch. A whole message can take up to `2 × maxBytes`. `maxBytes <= 0` or a non-finite value disables the plugin (`config.ts:21-26`, `index.ts:117-119`).

On overflow (`render.ts:363-421`) the broadest files are dropped, then the most specific one is truncated, then a compact intro "Workspace instructions were omitted or truncated…" is used. A marker `Workspace instruction budget N bytes: omitted <paths>; truncated <path> from A to B bytes` is added. Separately, `maxSourceBytes` (1 MiB by default): a file larger than this limit is ignored.

## 6. How the Host exposes operations to the Client

### 6.1. Typert Remote is not for plain JS

Remote methods are declared with the `@Remote` decorator on a service subclassing `TypertRemoteService` (`$P/dsh-typert-protocol/README.md:30-45`). The build generates the types, codecs, and Client registration (`lib/typert.remote-client.*`). There is a SRC fallback for the Host from sources, but "the Client Remote refuses to mount SRC descriptors that lack strict codecs" (`$P/dsh/docs/api-gateway.md:136-142`). A plain-JS bundle without a build and without decorators (Node 24 does not support them) will not get a Remote namespace. There is no documented manual path – whether one is possible at all is **not verified**.

### 6.2. The working path: an exact Fetch route under `/api`

`ctx.connection.fetch.register(route)` (`$P/dsh-client-connection/src/rpc.ts:146-176`):

```ts
interface ConnectionFetchRoute {
  readonly path: string                          // absolute path under /api
  readonly methods: readonly ('GET'|'HEAD'|'POST')[]
  readonly requestBody: 'buffered' | 'streaming'
  readonly fetch: (request: Request) => Promise<Response>
}
interface HostConnectionFetch { register(route): () => Promise<void> }
```

The route goes through the connection trust check and is reachable **only by owner peers**; everyone else gets 403 (`rpc-host.ts:215-223`). The path must lie under `/api` and be unique, otherwise an error (`assertFetchRoute`, `registerFetchRoute`, `:234-251`). The gateway takes only two-segment endpoints with a descriptor, so a three-segment path like `/api/dsh-loadout-manager/<op>` does not conflict with it.

The installed `dsh-context` does this (`~/.dsh/profiles/desktop/node_modules/dsh-context/lib/index.js`, functions `Y`/`Da`/`Ea`): `ctx.inject(['connection'], …)` → `ctx.effect(() => connection.fetch.register({ path: '/api/dsh-context/skills', methods: ['POST'], requestBody: 'buffered', fetch }))`. Responses are `Response.json({ ok: true, value } | { ok: false, error: { code, message } }, { headers: { 'cache-control': 'no-store' } })`. Its Client calls `fetch('api/dsh-context/…', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })` with a relative URL and no extra headers (`lib/client.js`, function `_r`).

A minimal Host (plain JS):

```js
// index.js
export const name = 'dsh-loadout-manager'

const json = (value) => Response.json(value, { headers: { 'cache-control': 'no-store' } })
const fail = (code, message) => json({ ok: false, error: { code, message } })

function route(ctx, op, handler) {
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => ctx.connection.fetch.register({
      path: `/api/dsh-loadout-manager/${op}`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try { body = await request.json() } catch { return fail('dsh-loadout-manager/bad-request', 'body is not JSON') }
        try { return json({ ok: true, value: await handler(body) }) }
        catch (error) { return fail('dsh-loadout-manager/failed', error instanceof Error ? error.message : String(error)) }
      },
    }), `dsh-loadout-manager: ${op} route`)
  })
}

export function apply(ctx, config) {
  route(ctx, 'state', async ({ workspace }) => ({ /* list of skills and rules */ }))
  route(ctx, 'set', async ({ level, kind, id, state }) => { /* write loadout.json + invalidate() */ })
}
```

```js
// client.js
const call = async (op, args) => {
  const res = await fetch(`api/dsh-loadout-manager/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error.message)
  return data.value
}
```

This example itself was not run – **not verified**. The pattern repeats the working `dsh-context`.

Other options:
- `ctx.webServer.register(route)` – a route on the bare HTTP server. `dsh-plugin` and `dsh-better-sidebar` do this, but then the `/api` trust check is left to the plugin;
- `user-actions.md` suggests implementing the operation as a Host service method and calling it from the UI through a Client-accessible entry point, for example `ctx.remote.commands.execute()` (a session command). A command does not suit a global panel without a session: `execute(agent, line, …)` requires an agent. The same document requires exposing the operation to the agent too, through a tool with the same parameters. That is a design decision, not an API matter.

## 7. File watching and lifecycle

- `ctx.fs.watch(target, changed, signal): Promise<() => Promise<void>>` (`$P/dsh-fs/src/index.ts:109-122`; Inspect confirms the `fs` service in the Host). The local implementation is chokidar with `depth: 0`: one file or the direct entries of a directory, `ignoreInitial`, a callback without event details (`$P/dsh-fs-local/src/index.ts:75-96`). `target` comes from `await ctx.fs.resolve(path)`. For a missing file it watches the parent directory. The base class throws "not supported" when the provider cannot watch.
- There is no separate file-watch service: `dsh-skill-filesystem` has `TODO(file-watch-service)` (`:444-445`).
- `fs/observed (target, observation, actor)`, emit mode (`$P/dsh-fs/src/index.ts:84-93`) – a tool observing a file. `skill-filesystem` filters `actor.name === 'edit' | 'write'` and takes `target.displayPath`. Suitable for catching edits the model makes to `loadout.json` and rules.
- `agent-instructions` catches edits without a watcher, with stat on every pre-step (section 5.4). For rules this is the same simple path.
- Lifecycle: register resources through `ctx.effect(() => { …; return dispose }, label)` (there is also a generator form, `skill-filesystem :139-141`) and `ctx.on(…)`. They are removed when the plugin unloads (`host-plugin.md`: "Register every resource inside `apply` with `ctx.effect` or `ctx.on` and return its cleanup"). Wrap registrations on `agent.ctx` in `agent.ctx.effect()` and duplicate the disposer in your own effect (`practices.md:8, 19`). The `ctx.on('dispose')` event is **not verified**; use `ctx.effect`.

Recommendation: for `loadout.json` (global and project) and the rule directories – `ctx.get('fs')?.watch`, falling back to `node:fs.watch` on directories. On an event, call `invalidate()` on the agents' providers and refresh the panel. Plus `fs/observed`. Additionally check rules in the context with stat on pre-step, as `agent-instructions` does.

## 8. Trash

- The Desktop Host is a **separate Node process** with no Electron API. The Electron main process starts it with `spawn(this.node, ['--expose-internals', …/dsh-desktop-host/lib/index.js, …])` and the environment `ELECTRON_RUN_AS_NODE: "1"` (`app.asar/lib/main.js`, `desktopNodeEnvironment` and `start()`). The `@deepseek-ai/dsh-desktop-host` package describes itself as "Private Node-mode host process for the Electron desktop application". The live process (`deepseek-harness --expose-internals …dsh-desktop-host/lib/index.js`) has `ELECTRON_RUN_AS_NODE=1` in its environment. In this mode `process.versions.electron = 44.7.0`, but `require('electron')` fails with `Cannot find module 'electron'`. `shell.trashItem` is unavailable, and `main.js` and `dsh-desktop-host` have no bridges to the trash (a search for `trash` comes up empty).
- `gio` is present: `/usr/bin/gio`, 2.90.1, the `gio trash [LOCATION…]` command. `trash-put` and `kioclient` are not installed.

Recommendation: `execFile('gio', ['trash', '--', absPath])` from the Host. If `gio` is missing (ENOENT) or returns an error, show the error in the UI and do not delete. Implementing the freedesktop Trash specification by hand (`$XDG_DATA_HOME/Trash`, `.trashinfo`, trash cans on other volumes) is a fallback for the future, not needed in the first version. Paths inside `app.asar` (for example, `dsh-doc`) cannot be deleted; hide the button for them.

## 9. `$DSH_HOME` and `$DSH_AGENTS_HOME`

Source: `$P/dsh-home-paths/src/index.ts`.

| Root | Variable | Default | Function |
|---|---|---|---|
| Harness home | `DSH_HOME` (`:18`) | `~/.dsh` (`:70-72`) | `resolveDshHome(configured?, env)` |
| Shared agents | `DSH_AGENTS_HOME` (`:27`) | `~/.agents` (`:78-80`) | `resolveAgentsHome(configured?, env)` |

```ts
// :101-110
const fromEnv = env[envName]
const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : fallback())
return resolve(expandHomePath(selected))   // ~, ~/, ~\ are expanded
```

An empty or whitespace-only variable counts as unset. Display forms: `~/.dsh`, `$DSH_HOME`, `~/.agents`, `$DSH_AGENTS_HOME` (`dshHomeDisplay`/`agentsHomeDisplay`, `:183-197`). Neither variable is set in the Desktop Host process environment.

What a plugin has access to:
- `ctx.dshHomePath(...segments)` – the root context gets it through `ctx.provide('dshHomePath', dshHomePath)` (`$P/dsh-app-boot/src/index.ts:43-47, 1243`). Read it through `ctx.get('dshHomePath')` (as `dsh-context` does). It is also available in the patch's `!!js` configs;
- there is no equivalent for agents home. The plugin must repeat `resolveAgentsHome` (the ten lines above) or take the path in its own `Config`.

## 10. The workspace list on the Host

- The Host service `ctx.workspaceRegistry` (`@deepseek-ai/dsh-workspace`, `$P/dsh-workspace/src/index.ts:113-116, 186-212`): `list(): Workspace[]` – synchronous, in registry order, without reading storage (`:302-316`). The service waits for `storageDomain` and `sessionPersistence`, so a plugin should take it through `ctx.inject(['workspaceRegistry'], …)` or `ctx.get`.
- `Workspace` (`$P/dsh-workspace/src/types.ts:69-153`): `id`, `path` (the canonical realpath at creation time), `title`, `createdAt`, `updatedAt`, `sessionIds`, `status(): Promise<'ok' | 'missing-dir'>`, plus mutators. There is also `resolveByPath(path): Promise<Workspace | undefined>` (Inspect).
- `dsh-api-workspace-controller` is the Remote facade `ctx.remote.workspace` (`create`, `rename`, `delete`, `follow`, and others). On the Client the `ctx.workspaces` service uses it, with a `list: WorkspaceSource` field (`$P/dsh-api-workspace-controller/src/client/index.ts:33-41`, `client/service.ts` `IWorkspaces`). The client panel can take the list from there without asking the Host. The details of the `WorkspaceSource` and `WorkspaceView` shapes are not verified; Client Inspect did not answer in that session (timeout).

There is no separate notion of "open" workspaces: the registry holds all registered ones.

## Conclusions for the implementation

1. **The shadow provider goes into the agent layer, not the global one.** In Desktop `dsh-skill-filesystem` is mounted in every preset (the preset layer), and the host row is disabled. A provider from a bundle's `apply(ctx)` lands in the global layer and loses across layers at any rank. Register on `agent.ctx` in an `agent/created` listener. This covers subagents too. Also hold the disposer in your own effect. Rank within the agent layer does not matter, since there are no competitors there, but any value can be set.
2. **Take the originals from the registry with the preset scope** rather than scanning yourself: `ctx.skills.list/get({ cwd, scope: presetKey })` through `ctx.agentPresets.acquireScope(composedPreset(agent.ctx))`. This gives the same parser, the same roots and custom roots, and `get()` for `manual` proxies to the original. Own scanning is needed only by the panel, to show overridden duplicates.
3. **Do not read `customSkillDirs` from the Config.** There is no API for it, and in the stock presets the value is `!!js`. Relative paths there resolve against the Host process's cwd (the profile directory), not the project. So custom roots are always global. `dsh-doc` arrives as `custom` from `app.asar` and is read-only.
4. **The `/` menu of a non-live session** does not see the agent layer and shows `off` skills until the agent is first activated. This is a DSH limitation worth naming in the UI.
5. **The model catalog updates on the next pre-step** after `invalidate()`, with an appended replacement message (append-only). Every `on ↔ manual/off` switch in a live session costs one such message.
6. **Rules: a `source.kind` of our own** (for example, `dsh-loadout-manager-rules`), `form: 'instructions'`, and `baseline`, `baselineIdentity`, and `changes[{action, scope, path, digest}]` fields modeled on `agent-instructions`. Restore the state from `session.deriveMessages()`: `eventAt` is deprecated for new code. Insert after the last `agent-instructions` message, otherwise after the last claimed one. Spread the decision. On `reject` and on an empty first step insert nothing. Catch changes with stat on every pre-step, as `agent-instructions` does; the context needs no watcher. The listener is a root one and receives every agent, so decide whether the `minimal` preset needs rules.
7. **Client ↔ Host communication – exact Fetch routes** `ctx.connection.fetch.register({ path: '/api/dsh-loadout-manager/<op>', methods: ['POST'], requestBody: 'buffered', fetch })`, owner only. Typert Remote is unavailable from plain JS. The SPEC should be corrected: "Remote or Service" → "a Fetch route under `/api`".
8. **Trash – `gio trash`.** The Host is a Node process without Electron, and `shell.trashItem` is unavailable. On an error, delete nothing.
9. **Paths:** `ctx.dshHomePath()` for `$DSH_HOME`, our own resolution of `$DSH_AGENTS_HOME` (an empty value = unset, expand `~`).
10. **Workspaces:** `ctx.workspaceRegistry.list()` on the Host, `ctx.workspaces.list` on the Client. Compute `projectRoot` for a workspace group as DSH does: the nearest ancestor with `.git` (file or directory), otherwise the path itself.
11. **YAML for rules.** `skill-filesystem` uses the `yaml` npm package. If the plugin needs full YAML in rule frontmatter, add `yaml` to the bundle's `dependencies`. Otherwise limit parsing to `name`/`description` by hand and document the limitation.

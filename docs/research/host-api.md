# Host API DSH для dsh-loadout

Проверка фактов, на которые опирается [SPEC.md](../SPEC.md), по исходникам установленной DSH 0.2.2-rc.2 (Desktop). Версия подтверждена по `dsh/node_modules/@deepseek-ai/dsh/package.json`.

Сокращение для путей: `$P` = `/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai`. Файлы внутри ASAR читаются инструментом read или через `ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE"`. Номера строк указаны по этим файлам. Живые сигнатуры сервисов дополнительно сверены через `cordis_inspect_query` (Host `Service.listService`). Запросы с параметром `input` в этой сессии отклонялись (`"input" must be an object`), поэтому Config смонтированных плагинов через Inspect прочитать не удалось.

Самое важное – в разделе 1.4: в Desktop теневой провайдер, зарегистрированный из `apply(ctx)` бандла, **не перекрывает** скиллы `dsh-skill-filesystem`.

## 1. `ctx.skills.registerProvider`

Источник: `$P/dsh-skill/src/index.ts`.

### 1.1. Типы

```ts
// :247-267
interface SkillProvider {
  readonly name: string                       // уникально в пределах слоя
  readonly list: (options: SkillLookupOptions) =>
    Promise<readonly SkillCandidate[] | SkillProviderObservation>
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) =>
    Promise<SkillDefinition | undefined>
}
// :270-275
interface SkillProviderControl {
  readonly signal: AbortSignal   // abort при снятии регистрации
  readonly invalidate: () => void
}
// :103-119
interface SkillLookupOptions { cwd?: string; signal?: AbortSignal }
interface SkillViewOptions extends SkillLookupOptions { scope?: ScopeKey }
// :239-244
interface SkillProviderObservation { candidates: readonly SkillCandidate[]; complete: boolean }
```

Кандидат (`:57-84`) – это `SkillSummary` плюс поля провайдера:

| Поле | Тип | Обязательность и проверка (`validateCandidate`, `:707-739`) |
|---|---|---|
| `name` | string | kebab-case: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` |
| `description` | string | непустая |
| `whenToUse` | string | необязательно |
| `invocation` | `{ modelInvocable: boolean, userInvocable: boolean }` | оба поля boolean. Валидатор пропускает `undefined`, но `toSummary` копирует его как есть, и потребители читают `skill.invocation.modelInvocable`, поэтому задавать надо всегда |
| `source` | string | любая строка: `project-dsh`, `project-agents`, `runtime`, `user-dsh`, `user-agents`, `custom`, `bundled` или своя |
| `provider` | string | должно совпадать с `provider.name`, иначе ошибка |
| `rank` | number | конечное число, меньше – приоритетнее |
| `locator` | unknown | непрозрачный хэндл, возвращается в `get()` |
| `path` | string | необязательно, абсолютный путь файла |
| `resourceBase` | `{kind:'directory',path}` \| `{kind:'url',url}` \| `{kind:'opaque',description}` | необязательно |
| `metadata` | object | необязательно |

`get()` возвращает `SkillDefinition` = `SkillSummary` + `content: string` (+ `metadata`). Реестр проверяет определение (`validateDefinition`, `:748-767`). Если `definition.name !== candidate.name`, реестр инвалидирует кэш и возвращает `undefined` (`:512-515`).

### 1.2. Синхронность и аргументы

- Фабрика в `registerProvider(create)` синхронная: «Register a borrowed same-process provider synchronously during plugin apply» (`:380-390`). Возвращает disposer эффекта Cordis.
- `list()` и `get()` асинхронные, должны вернуть Promise (`waitWithAbort(provider.list(options), …)`, `:603`).
- `list()` получает тот же объект опций, что передал потребитель реестра: `{ cwd, signal, scope }`. Контракт провайдера – только `cwd` и `signal` (`:110-115`), но `scope` в объекте физически есть. `cwd` – рабочая директория сессии: `dsh-tool-skill` берёт её через `ctx.workingDirectory.ensure(agent)`, `scope` – сам объект `Agent` (`$P/dsh-tool-skill/src/index.ts:136-137, 190, 226`). `projectRoot` реестр не передаёт – провайдер вычисляет его сам.
- Имена `runtime` зарезервированы (`:406-408`). Дубликат имени провайдера в одном слое бросает ошибку (`:334-336`).

### 1.3. Кэш и `invalidate()`

`collect()` кэширует результат по ключу `{cwd, scopes: chain ids, revision}` (`:519-549, 643-645`), до 128 записей. `invalidate()` срабатывает, только пока именно эта регистрация жива (`:396-401`), и вызывает `invalidateCache()`: `revision += 1`, очистка кэша, событие `skills/change` (`:621-625, 648-659`). Регистрация и снятие провайдера тоже инвалидируют кэш (`ScopedLayers.effect` → `onChange`, `$P/dsh-scope/src/store.ts:226-266`). Неполные наблюдения (`complete: false`) не кэшируются.

Без вызова `invalidate()` реестр не перечитает провайдер для того же `cwd`: изменение `loadout.json` должно заканчиваться `invalidate()`.

### 1.4. Слои и куда попадает провайдер бандла

Реестр слоистый (`:345-355`): глобальный слой плюс слой на каждый scope. Регистрация попадает в слой scope вызывающего контекста (`scopeOf(ctx)`, `$P/dsh-scope/src/store.ts:231-247`). Чтение собирает слои так:

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

Сначала глобальный слой, потом цепочка scope от дальнего предка к ближнему. Одноимённый кандидат ближнего слоя заменяет дальний **целиком, без учёта rank**. Rank сравнивается только внутри одного слоя.

Цепочка scope агента: `[agent, presetGeneration]`. Agent – сам себе ключ scope (`createScope(loopCtx, this)`, `$P/dsh-agent-loop/src/agent.ts:148`; `agentCarrier`, `$P/dsh-agent/src/dispatch.ts:94-96`). Родителем назначается ключ ревизии пресета (`bindScopeParent(key, generation.key)`, `$P/dsh-agent-preset-registry/src/index.ts:281-290`). Плагины пресета монтируются в контексте `createScope(this.owner, key)` (`:119-127`), то есть регистрируют в слой пресета.

Где смонтирован `dsh-skill-filesystem` в Desktop:

- `dsh-base` вставляет host-строку `skill-filesystem` (`$P/dsh-base/cordis.patch.yml:315-316`);
- `dsh-web-app` её **отключает**: «the base host `skill-filesystem` row is disabled here (presets own local discovery)» (`$P/dsh-web-app/cordis.patch.yml:542-552`), так же отключены `tool-skill` и `agent-instructions` (`:554, 604`);
- пресеты `standard`, `ptc`, `cordis` монтируют свой `skill-filesystem` внутри `config.plugins` (`$P/dsh-web-app/presets/standard.patch.yml:40-44`, `ptc.patch.yml:40-41`, `cordis.patch.yml:126-130`). Пресет `minimal` не монтирует ни скиллы, ни `agent-instructions`.

Бандл профиля (`dsh.profile.bundles`, как `dsh-better-sidebar`) вставляет строку в корневое дерево. Его `apply(ctx)` получает контекст без scope, и провайдер попадает в **глобальный** слой. `skill-filesystem` живёт в **слое пресета**. Слой пресета ближе, поэтому оригинал из `skill-filesystem` заменяет наш кандидат rank 50 при любом rank. Теневой подход из SPEC в таком виде не работает.

Рабочий вариант – регистрировать провайдер в слое **агента**. Он ещё ближе слоя пресета:

```js
ctx.on('agent/created', ({ agent }) => {
  // agent.ctx несёт scope = agent; this.ctx сервиса подменяется на вызывающий контекст
  const dispose = agent.ctx.skills.registerProvider(control => makeProvider(agent, control))
  // по practices.md: держать disposer ещё и в своём эффекте
})
```

Почему это работает:
- `agent/created` – serial-событие, его ждут до выпуска очереди сообщений, то есть до первого `pre-step` (`$P/dsh-agent/src/runtime-types.ts:280-291`). Слушатель без scope получает события всех агентов, включая субагентов (`scopeTarget`: «admits untagged listeners globally», `$P/dsh-scope/src/index.ts:158-185`).
- Вызов сервиса через `agent.ctx.skills` подставляет `agent.ctx` в `this.ctx` (tracker `{ associate: name, property: 'ctx' }`, `$P/cordis/src/service.ts:46-55`). Так же устроен `register()`, который явно полагается на `scopeOf(this.ctx)` (`$P/dsh-skill/src/index.ts:439-460`).
- `practices.md`: «Register per-agent behavior on `agent.ctx`, obtained in an `agent/created` listener… keep that disposer, keyed by agent, in your plugin's own effect».

На живом рантайме регистрацию в слой агента я не запускал: **не проверено**.

Ограничение: Remote `skills/list` (меню `/`) для **неживой** сессии читает реестр со scope ревизии пресета, без слоя агента (`$P/dsh-api-session-controller/src/skill-catalog.ts:63-78`). Пока сессия не активирована, меню `/` покажет и `off`-скиллы. Как только агент создан, используется `scope = live` и тень действует.

### 1.5. Дедупликация (код)

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
    || left.providerOrder - right.providerOrder   // глобальный счётчик регистраций провайдеров
    || left.localOrder - right.localOrder         // порядок внутри list() одного провайдера
}
```

Runtime-скиллы (`ctx.skills.register`) идут с `rank 250` и `providerOrder -1` (`:589-598`). Внутри слоя порядок такой: rank, затем порядок регистрации провайдера, затем порядок в его `list()`. Сначала дедуп внутри слоя, потом перекрытие слоями.

## 2. Скрывает ли неинвокабельный кандидат оригинал

Да, если он в том же или более близком слое. Реестр не смотрит на `invocation` ни при дедупе (код выше), ни при сборке слоёв: «exposes sorted invocation-neutral summaries» (`:345-355`), «Consumers apply model or user invocation policy at their operational boundary» (`:462-468`). Фильтрация идёт уже после выбора победителя:

- каталог модели: `snapshot.skills.filter(isModelInvocable)` (`$P/dsh-tool-skill/src/index.ts:226-229`);
- инструмент `skill`: `list()` → победитель → `if (!isModelInvocable(summary)) throw` (`:138-144`), затем ещё раз на определении после `get()` (`:145-151`);
- меню `/`: `(await skillRegistry.list({ cwd, scope })).filter(isUserInvocable)` (`$P/dsh-api-session-controller/src/skill-catalog.ts:78`).

Поэтому `{modelInvocable:false, userInvocable:false}` выигрывает дедуп и прячет оригинал везде. Для `{modelInvocable:false, userInvocable:true}`:

```ts
// $P/dsh-tool-skill/src/index.ts:190-205  (жест `/name` в pre-step)
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
  const match = collected.entries.get(name)          // победитель
  const definition = await waitWithAbort(match.provider.get(match.candidate, options), options.signal)
  ...
}
```

`/name` вызывает `get()` провайдера-победителя, то есть наш. Проверка `isUserInvocable` идёт по **определению**, которое вернул наш `get()`, поэтому в нём должно стоять `invocation: { modelInvocable: false, userInvocable: true }`. Для `off` наш `get()` может вернуть `undefined`.

Тело для `manual` можно не парсить самому. Внутри провайдера слоя агента вызвать реестр со scope ревизии пресета: цепочка `[presetKey]` не включает слой агента, рекурсии нет. Это даст оригинал из `skill-filesystem` с тем же парсером и корнями:

```js
const lease = await ctx.agentPresets.acquireScope(ctx.agentPresets.composedPreset(agent.ctx))
try {
  const originals = await ctx.skills.list({ cwd, scope: lease.key })          // для list()
  const original  = await ctx.skills.get(name, { cwd, scope: lease.key })     // для get() manual
} finally { await lease[Symbol.asyncDispose]() }
```

Так делает установленный `dsh-context` (`serviceFor`/`acquireScope` в маршруте `/api/dsh-context/skills`). Оговорка: `acquireScope(id)` отдаёт **текущую** ревизию пресета, а агент мог остаться на старой после правки пресета (`$P/dsh-agent-preset-registry/src/index.ts:389-398`). Для штатных пресетов это редкость. Нестыковка ревизий **не проверена**.

## 3. `dsh-skill-filesystem`

Источник: `$P/dsh-skill-filesystem/src/index.ts`.

### 3.1. Корни, projectRoot, cwd

`roots(cwd)` (`:251-271`) пересчитывается на **каждый** вызов `list()`:

| Rank | source | Путь | Условие |
|---|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` | `includeDefaultRoots && cwd !== undefined` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` | то же |
| 300 | `custom` | каждый `customSkillDirs[i]` | всегда |
| 400 | `user-dsh` | `<dshHome>/skills`, пропускает `.system` | `includeDefaultRoots` |
| 500 | `user-agents` | `<agentsHome>/skills` | `includeDefaultRoots` |
| 600 | `bundled` | `bundledSkillDir` или `$DSH_BUNDLED_SKILL_DIR` | если задан |

`projectRoot = findProjectRoot(resolve(cwd), ctx.fs)` (`:959-969`): ближайший предок, где существует `.git` (файл или каталог, проверка `stat`), иначе сам `cwd`. `cwd` берётся из `options.cwd`. Без `cwd` (например, чтение без сессии) проектных корней нет.

В Host-процессе `DSH_BUNDLED_SKILL_DIR` не задан (проверено по `/proc/<pid>/environ`). В пресетах `standard`, `ptc`, `cordis` `customSkillDirs` содержит каталог `skills` пакета `@deepseek-ai/dsh-agent-preset` внутри `app.asar` – так приходит `dsh-doc` с `source: 'custom'`. Панель должна показывать такие скиллы только для чтения: удалить их нельзя.

Скилл – это `<root>/<name>/SKILL.md` (каталог или симлинк на каталог) или `<root>/<name>.md`, только верхний уровень (`discoverRoot`, `:737-765`). Чтение идёт через `ctx.fs`, если сервис есть, иначе через `node:fs`.

### 3.2. Frontmatter

```ts
// :931-943
function parseFrontmatter(raw) {
  const firstLine = raw.slice(0, raw.indexOf('\n')).replace(/\r$/, '')
  if (firstLine !== '---') return undefined
  ... findClosingFrontmatter: строка ровно '---' (CR допускается)
  const parsed = parseYaml(yaml)          // import { parse as parseYaml } from 'yaml'
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return { data: parsed, body: raw.slice(closing.bodyStart) }
}
```

Парсер – полноценный npm-пакет `yaml`: блочные скаляры, кавычки и прочий YAML 1.2 поддерживаются. Без frontmatter, с невалидным YAML, без непустых строковых `name`/`description` или с не-kebab-case `name` файл пропускается с warning (`:811-854`). Тело – `parsed.body.trim()`. Необязательные поля: `whenToUse` (строка), `metadata` (объект).

Инвокация (`:1014-1051`):

```ts
rejectLegacyInvocationKey(data, 'disableModelInvocation', 'disable-model-invocation')
rejectLegacyInvocationKey(data, 'modelInvocable', 'disable-model-invocation')
rejectLegacyInvocationKey(data, 'userInvocable', 'user-invocable')
const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation')
const userInvocable = frontmatterBoolean(data, 'user-invocable')
return { modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false }
```

`frontmatterBoolean` принимает boolean, `1`/`0`, `'1'`/`'0'`, `true/yes/on`, `false/no/off` без учёта регистра. Другое значение – ошибка, и скилл пропускается. Ключ в camelCase (`disableModelInvocation` и т. п.) тоже приводит к пропуску скилла.

### 3.3. `customSkillDirs`

```ts
// :168
this.customSkillDirs = (config.customSkillDirs ?? []).map(root => resolve(root))
```

Пути разрешаются **один раз в конструкторе** через `path.resolve`, то есть от `process.cwd()` Host-процесса. Это не cwd сессии и не projectRoot. У Host-процесса Desktop cwd – каталог профиля `~/.dsh/profiles/desktop` (`readlink /proc/<host-pid>/cwd`). `~` в `customSkillDirs` **не раскрывается** (в отличие от `dshHome`/`agentsHome`, которые проходят `expandHomePath`). Значит, custom-корни всегда глобальные и к проектному `loadout.json` не относятся.

### 3.4. Как прочитать Config другого плагина

Публичного API «прочитать смонтированный Config плагина X» для плагинов нет:
- `ctx.configEditor.configuration()` и `entries()` отдают строки только Host-дерева (сигнатуры из Inspect), а строка `skill-filesystem` в Host отключена;
- `ctx.agentPresets.readDocument(id)` – Remote, отдаёт YAML-дамп `plugins` пресета с **невычисленными** `!!js` (`$P/dsh-agent-preset-registry/src/index.ts:233-246`). Штатный `customSkillDirs` – как раз `!!js`-выражение;
- `compositionInventory()` отдаёт строки без config (`composition-inventory.ts`);
- читать `cordis.patch.yml` профиля `references/configuration.md` запрещает. К тому же итоговый config собирается из нескольких слоёв.

Вывод: config не читать. Список скиллов, включая custom и bundled, брать из реестра: `ctx.skills.list({ cwd, scope: presetKey })` возвращает победителей с `source` и `path` (раздел 2). Перекрытые одноимённые кандидаты реестр не отдаёт. Чтобы панель показала «перекрытые», стандартные корни (`project-*`, `user-*`) надо сканировать самостоятельно, а custom-корни выводить из `path` кандидатов с `source: 'custom'`.

Переопределения `dshHome`/`agentsHome` в штатных пресетах не заданы, поэтому действуют `$DSH_HOME`/`$DSH_AGENTS_HOME` (раздел 9).

### 3.5. Наблюдение за файлами

Провайдер сам следит за корнями через chokidar (`depth: 1`, `SkillWatchManager`, `:294-615`) и слушает `fs/observed` от инструментов `edit`/`write` (`:142-145`). При изменениях вызывает `invalidate()`. Изменения файлов скиллов наш плагин отслеживать не обязан. После инвалидации реестр снова вызовет и наш `list()`.

## 4. `dsh-tool-skill`: digest и реакция на `invalidate()`

Источник: `$P/dsh-tool-skill/src/index.ts`.

- Слушатель `agent/pre-step` (`:217-255`) на **каждом** шаге берёт `ctx.skills.snapshot({ cwd, signal, scope: agent })` и фильтрует `isModelInvocable`. Каталог публикуется, только если агенту виден ровно этот инструмент `skill` (`ctx.tools.get('skill', agent) === skillTool`).
- Digest (`:347-355`): sha256 от строк `JSON.stringify([name, description])`, где описание нормализовано (пробелы схлопнуты, обрезка до `catalogDescriptionMaxLength = 500`), с префиксом `incomplete\n`, если обнаружение неполное.
- Видимый digest берётся из последнего события `user/message` с `source.kind === 'skill-catalog'`, которое ещё на поверхности сессии (`catalogHistory`, `:381-398`). Если digest совпал, ничего не добавляется. Если отличается и каталог уже публиковался, добавляется новое сообщение «The available skill catalog changed. This complete catalog replaces every earlier available-skills list…» с `source.update: true` (`:289-327`). Старые сообщения не переписываются: append-only, KV-кэш сохраняется.
- На `skills/change` инструмент не подписан. Реакция на `invalidate()` – на ближайшем `pre-step`: кэш реестра сброшен, `snapshot` пересоберётся, digest сравнится. Между шагами ничего не происходит.

## 5. `dsh-agent-instructions`

Источники: `$P/dsh-agent-instructions/src/{index,state,render,config,files,digest}.ts`.

### 5.1. Где живёт и как доходит до субагентов

В Desktop host-строка отключена (`$P/dsh-web-app/cordis.patch.yml:604-605`), плагин монтируется внутри пресетов `standard`/`ptc`/`cordis` с `maxBytes: 65536` (`presets/standard.patch.yml:15-18`). Его `ctx.on('agent/pre-step')` зарегистрирован на контексте пресета. Такой слушатель получает события каждого агента, у которого ключ пресета есть в цепочке scope (`scopeTarget`, `$P/dsh-scope/src/index.ts:158-185`).

Субагенты присоединяются к той же ревизии пресета (`composeFrom`, `$P/dsh-agent-preset-registry/src/index.ts:313-327`; вызов в `$P/dsh-subagent/src/child-agent.ts:201`). У них свой `pre-step`, и плагин вставляет им свой baseline в **их** сессию. `agent/created` плагин не слушает. Состояние по агентам – только кэш: `WeakMap<Session, …>` (версии файлов, подготовленный baseline). Источник истины – поверхность сессии.

Форк получает историю родителя, включая baseline. Плагин находит его на поверхности и не вставляет повторно (`visibleBaselineSource`, `index.ts:47-64`).

Для dsh-loadout: слушатель `agent/pre-step` в `apply(ctx)` бандла (без scope) получит pre-step **всех** агентов всех пресетов, включая `minimal`, где `agent-instructions` нет. Если правила должны идти только туда, где есть AGENTS.md, нужна проверка, например по `ctx.agentPresets.inspectCompositions(agent.ctx)` на наличие модуля `@deepseek-ai/dsh-agent-instructions` (сигнатура из Inspect; не проверено).

### 5.2. Решение pre-step

```ts
// index.ts:330-356
ctx.on('agent/pre-step', async ({ agent, messages, step, signal }, next) => {
  const decision = await next()
  await waitForProjections(agent)
  const pending = agent.inbox.nextStep.filter(isAgentInstructionsMessage)
  const desired = await compose(agent, signal, messages, pending)
  if (decision.kind === 'reject' || (step === 1 && decision.messages.length === 0)) {
    syncInbox(agent, messages, desired)       // оставить контекст ждать в inbox
    return decision
  }
  for (const message of pending) agent.inbox.remove(message.id)
  if (desired === undefined || decision.messages.some(m => sameContextPayload(m, desired))) return decision
  const lastClaimedIndex = decision.messages.findLastIndex(m => messages.includes(m))
  const entered = decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired)
  return { ...decision, messages: entered }
})
```

Тип решения (`$P/dsh-agent/src/runtime-types.ts:139-146`): `{ kind: 'reject' } | { kind: 'enter', messages: UserMessage[], startsRequestSeries?: true }`. Событие `agent/pre-step`, режим waterfall (`:339-351`).

Сообщение вставляется сразу после последнего «заявленного» (claimed) сообщения пользователя, до runtime-контекста и каталога скиллов. Каталог `dsh-tool-skill` дописывается в конец, жест `/name` – тоже в конец.

Порядок между нашим корневым слушателем и слушателем пресета в цепочке waterfall я не проверял. Надёжная вставка – после последнего сообщения с `source.kind === 'agent-instructions'`, если оно есть, иначе после последнего claimed. Если наш слушатель окажется внутренним, `agent-instructions` вставит своё на `lastClaimedIndex + 1` перед нашим, и порядок всё равно получится правильным.

### 5.3. Форма сообщения и маркер

Сообщение создаётся `createUserMessage` (`$P/dsh-llm/src/message.ts:221-253`): `{ id: randomUUID(), role: 'user', content, source }`, deep-freeze. В plain JS:

```js
const msg = Object.freeze({
  id: crypto.randomUUID(), role: 'user',
  content: [Object.freeze({ type: 'text', text })],
  source: Object.freeze({ kind: 'dsh-loadout-rules', form: 'instructions', baseline: true, changes: [...] }),
})
```

Источник (`state.ts:40-49`):

```ts
interface AgentInstructionSource {
  kind: 'agent-instructions'
  form: 'instructions'          // ContextForm: семантика для UI
  baseline?: true               // полный baseline, а не дельта
  baselineIdentity?: string     // JSON {projectRoot (относит. к cwd), markers, maxBytes, …}
  changes: { action: 'set'|'replace'|'remove', scope: string, path: string, digest?: string }[]
}
```

`MessageSourceMap` расширяемый, свой `kind` допустим: «each producer declares its own `kind`… consumers fall through unknown kinds» (`message.ts:103-115`). Использовать `kind: 'agent-instructions'` нельзя: плагин собирает `changes` со всех сообщений этого kind и удаляет их из inbox (`state.ts:140-161`, `index.ts:66-68`).

Как определяется «уже вставлено» (replay, resume, compaction):
- baseline: последний claimed с `source.baseline === true`, иначе обход `agent.session.surface.nodes` с конца в поисках `user/message`, где `source.kind === 'agent-instructions' && baseline === true` (`index.ts:47-64`). Если `baselineIdentity` не совпал (сменились cwd/projectRoot/конфиг), вставляется заменяющий baseline с интро «This complete workspace instruction baseline replaces all earlier…» и `remove` для пропавших scope (`index.ts:139-205`, `render.ts:21-24`);
- эффективное состояние файлов – последний `change` для каждого `scope` по всем видимым сообщениям этого kind (`visibleInstructionChanges`, `state.ts:140-161`);
- `syncInbox` не вставляет повторно, если такой же payload (`content` + `source`, `isDeepStrictEqual`) уже есть среди claimed или на поверхности (`index.ts:245-270`).

Читается только поверхность (`surface.nodes`): после compaction, если baseline выпал из поверхности, он будет вставлен заново.

`session.eventAt(seq)` в исходнике помечен `@deprecated … new calls are prohibited` (`$P/dsh-session/src/index.ts:738-747`). Для нового кода есть недепрекейтнутый `session.deriveMessages()` – массив видимых сообщений поверхности с `source`, кэшированный (`:1079-1100`).

### 5.4. Обновления и удаления

Watcher'а нет. На **каждом** `pre-step` `compose()` вызывает `reconcileInstructionContext` по всем baseline-scope (глобальные `AGENTS.md` и цепочка от projectRoot до cwd по всем кандидатам). Для каждого файла выполняется `fs.stat` (метаданные `version`). Если версия совпала с кэшем и digest с видимым, файл не перечитывается (`state.ts:251-456`). Поэтому правка AGENTS.md любым способом обнаружится на следующем шаге. Инструменты `read`/`write`/`edit` (`tools/result`, `index.ts:358-374`) нужны только чтобы добавить **вложенные** scope между cwd и тронутым файлом. Касания внутри открытого шага откладываются до `step/end` и проецируются в inbox через `agent.inbox.prepend('next-step', …)`.

SPEC говорит, что обновление приходит «после касаний файлов инструментами». Это неполно: baseline-файлы перепроверяются stat'ом на каждом шаге.

Тексты дельт (`render.ts:226-270`):

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

У пакета дельт интро пустое, секции в одной рамке `<system-reminder>`.

### 5.5. Формат baseline

```ts
// render.ts:16-20, 100-102, 315-327
const AGENT_INSTRUCTIONS_INTRO = 'The following workspace instructions may be relevant to your work. '
  + 'Use them as guidance when applicable. More specific instructions take precedence over broader ones. '
  + 'They do not override system, developer, or direct user instructions.'
sectionText = `Instructions from: ${file.displayPath}\n\n${file.content}`
text = ['<system-reminder>', escape([marker, intro, ...sections].filter(nonEmpty).join('\n\n')), '</system-reminder>'].join('\n')
escape: body.replaceAll('</system-reminder>', '<\\/system-reminder>')
```

`displayPath`: глобальные – `~/.dsh/AGENTS.md` или `$DSH_HOME/AGENTS.md`, `~/.agents/AGENTS.md` или `$DSH_AGENTS_HOME/AGENTS.md` (`files.ts:91-97, 337-343`, `dshHomeDisplay`). Проектные – путь относительно projectRoot (`relativeDisplay`). Порядок: сначала глобальная цепочка (`$DSH_HOME` → `$DSH_AGENTS_HOME`), затем проектная от корня к cwd. Содержимое файла вставляется как есть, без trim (`readBounded`, `files.ts:387-417`). trim используется только для digest дубликатов. Digest в `changes` – sha1 сырого содержимого (`digest.ts:14-15`).

### 5.6. `maxBytes`

`maxBytes` (обязательное поле Config, в пресетах 65536) – лимит UTF-8 байт **на каждую** цепочку (user-global и project) в одном baseline или пакете дельт. Сообщение целиком может занять до `2 × maxBytes`. `maxBytes <= 0` или не конечное значение отключает плагин (`config.ts:21-26`, `index.ts:117-119`).

При переполнении (`render.ts:363-421`) отбрасываются самые широкие файлы, затем усекается самый специфичный, затем используется компактное интро «Workspace instructions were omitted or truncated…». Добавляется маркер `Workspace instruction budget N bytes: omitted <paths>; truncated <path> from A to B bytes`. Отдельно `maxSourceBytes` (по умолчанию 1 MiB): файл больше этого лимита игнорируется.

## 6. Как Host отдаёт операции Client

### 6.1. Typert Remote – не для plain JS

Remote-методы объявляются декоратором `@Remote` на сервисе-наследнике `TypertRemoteService` (`$P/dsh-typert-protocol/README.md:30-45`). Типы, кодеки и регистрацию для Client генерирует сборка (`lib/typert.remote-client.*`). Есть SRC-фолбэк для Host из исходников, но «the Client Remote refuses to mount SRC descriptors that lack strict codecs» (`$P/dsh/docs/api-gateway.md:136-142`). Plain-JS бандл без сборки и без декораторов (Node 24 их не поддерживает) Remote-неймспейс не получит. Документированного ручного пути нет – **не проверено**, что он возможен вообще.

### 6.2. Рабочий путь: exact Fetch route на `/api`

`ctx.connection.fetch.register(route)` (`$P/dsh-client-connection/src/rpc.ts:146-176`):

```ts
interface ConnectionFetchRoute {
  readonly path: string                          // абсолютный путь под /api
  readonly methods: readonly ('GET'|'HEAD'|'POST')[]
  readonly requestBody: 'buffered' | 'streaming'
  readonly fetch: (request: Request) => Promise<Response>
}
interface HostConnectionFetch { register(route): () => Promise<void> }
```

Маршрут проходит проверку доверия соединения, и его достигают **только owner-пиры**, остальным отвечает 403 (`rpc-host.ts:215-223`). Путь должен лежать под `/api` и быть уникальным, иначе ошибка (`assertFetchRoute`, `registerFetchRoute`, `:234-251`). Gateway занимает только двухсегментные эндпоинты с дескриптором, поэтому путь из трёх сегментов вида `/api/dsh-loadout/<op>` с ним не конфликтует.

Так делает установленный `dsh-context` (`~/.dsh/profiles/desktop/node_modules/dsh-context/lib/index.js`, функции `Y`/`Da`/`Ea`): `ctx.inject(['connection'], …)` → `ctx.effect(() => connection.fetch.register({ path: '/api/dsh-context/skills', methods: ['POST'], requestBody: 'buffered', fetch }))`. Ответы – `Response.json({ ok: true, value } | { ok: false, error: { code, message } }, { headers: { 'cache-control': 'no-store' } })`. Его Client вызывает `fetch('api/dsh-context/…', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })` с относительным URL, без дополнительных заголовков (`lib/client.js`, функция `_r`).

Минимальный Host (plain JS):

```js
// index.js
export const name = 'dsh-loadout'

const json = (value) => Response.json(value, { headers: { 'cache-control': 'no-store' } })
const fail = (code, message) => json({ ok: false, error: { code, message } })

function route(ctx, op, handler) {
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => ctx.connection.fetch.register({
      path: `/api/dsh-loadout/${op}`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try { body = await request.json() } catch { return fail('dsh-loadout/bad-request', 'body is not JSON') }
        try { return json({ ok: true, value: await handler(body) }) }
        catch (error) { return fail('dsh-loadout/failed', error instanceof Error ? error.message : String(error)) }
      },
    }), `dsh-loadout: ${op} route`)
  })
}

export function apply(ctx, config) {
  route(ctx, 'state', async ({ workspace }) => ({ /* список скиллов и правил */ }))
  route(ctx, 'set', async ({ level, kind, id, state }) => { /* запись loadout.json + invalidate() */ })
}
```

```js
// client.js
const call = async (op, args) => {
  const res = await fetch(`api/dsh-loadout/${op}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error.message)
  return data.value
}
```

Сам этот пример не запускался – **не проверено**. Шаблон повторяет работающий `dsh-context`.

Другие варианты:
- `ctx.webServer.register(route)` – маршрут на голом HTTP-сервере. Так делают `dsh-plugin` и `dsh-better-sidebar`, но тогда проверка доверия `/api` остаётся на плагине;
- `user-actions.md` предлагает реализовать операцию как метод Host-сервиса и вызывать её из UI через Client-доступную точку входа, например `ctx.remote.commands.execute()` (команда сессии). Для глобальной панели без сессии команда не подходит: `execute(agent, line, …)` требует агента. Тот же документ требует отдать операцию и агенту через инструмент с теми же параметрами. Это решение для дизайна, к API не относится.

## 7. Наблюдение за файлами и жизненный цикл

- `ctx.fs.watch(target, changed, signal): Promise<() => Promise<void>>` (`$P/dsh-fs/src/index.ts:109-122`; Inspect подтверждает сервис `fs` в Host). Локальная реализация – chokidar с `depth: 0`: один файл или прямые элементы каталога, `ignoreInitial`, колбэк без деталей события (`$P/dsh-fs-local/src/index.ts:75-96`). `target` берётся из `await ctx.fs.resolve(path)`. Для отсутствующего файла следит за родительским каталогом. Базовый класс бросает ошибку «not supported», если провайдер не умеет watch.
- Отдельного file-watch сервиса нет: в `dsh-skill-filesystem` стоит `TODO(file-watch-service)` (`:444-445`).
- `fs/observed (target, observation, actor)`, режим emit (`$P/dsh-fs/src/index.ts:84-93`) – наблюдение файла инструментами. `skill-filesystem` фильтрует `actor.name === 'edit' | 'write'` и берёт `target.displayPath`. Годится, чтобы ловить правки `loadout.json` и правил моделью.
- Правки `agent-instructions` ловит без watcher'а, stat'ом на каждом pre-step (раздел 5.4). Для правил это тот же простой путь.
- Жизненный цикл: ресурсы регистрировать через `ctx.effect(() => { …; return dispose }, label)` (есть и генераторная форма, `skill-filesystem :139-141`) и `ctx.on(…)`. Они снимаются при выгрузке плагина (`host-plugin.md`: «Register every resource inside `apply` with `ctx.effect` or `ctx.on` and return its cleanup»). Регистрации на `agent.ctx` оборачивать в `agent.ctx.effect()` и дублировать disposer в своём эффекте (`practices.md:8, 19`). Событие `ctx.on('dispose')` – **не проверено**, использовать `ctx.effect`.

Рекомендация: для `loadout.json` (глобальный и проектные) и каталогов правил – `ctx.get('fs')?.watch`, с фолбэком на `node:fs.watch` по каталогам. По событию вызывать `invalidate()` у провайдеров агентов и обновлять панель. Плюс `fs/observed`. Правила в контексте дополнительно сверять stat'ом на pre-step, как это делает `agent-instructions`.

## 8. Корзина

- Host Desktop – **отдельный Node-процесс**, Electron API в нём нет. Электроновский main запускает его через `spawn(this.node, ['--expose-internals', …/dsh-desktop-host/lib/index.js, …])` с окружением `ELECTRON_RUN_AS_NODE: "1"` (`app.asar/lib/main.js`, `desktopNodeEnvironment` и `start()`). У пакета `@deepseek-ai/dsh-desktop-host` описание «Private Node-mode host process for the Electron desktop application». У живого процесса (`deepseek-harness --expose-internals …dsh-desktop-host/lib/index.js`) в окружении `ELECTRON_RUN_AS_NODE=1`. В этом режиме `process.versions.electron = 44.7.0`, но `require('electron')` падает с `Cannot find module 'electron'`. `shell.trashItem` недоступен, мостов к корзине в `main.js` и `dsh-desktop-host` нет (поиск `trash` пустой).
- `gio` есть: `/usr/bin/gio`, 2.90.1, команда `gio trash [LOCATION…]`. `trash-put` и `kioclient` не установлены.

Рекомендация: `execFile('gio', ['trash', '--', absPath])` из Host. Если `gio` нет (ENOENT) или он вернул ошибку, показать ошибку в UI и не удалять. Реализация спецификации freedesktop Trash своими руками (`$XDG_DATA_HOME/Trash`, `.trashinfo`, корзины на других томах) – запасной вариант на будущее, в первой версии не нужна. Пути внутри `app.asar` (например, `dsh-doc`) удалять нельзя, кнопку для них скрыть.

## 9. `$DSH_HOME` и `$DSH_AGENTS_HOME`

Источник: `$P/dsh-home-paths/src/index.ts`.

| Корень | Переменная | По умолчанию | Функция |
|---|---|---|---|
| Harness home | `DSH_HOME` (`:18`) | `~/.dsh` (`:70-72`) | `resolveDshHome(configured?, env)` |
| Shared agents | `DSH_AGENTS_HOME` (`:27`) | `~/.agents` (`:78-80`) | `resolveAgentsHome(configured?, env)` |

```ts
// :101-110
const fromEnv = env[envName]
const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : fallback())
return resolve(expandHomePath(selected))   // ~, ~/, ~\ раскрываются
```

Пустая или пробельная переменная считается незаданной. Отображаемые формы: `~/.dsh`, `$DSH_HOME`, `~/.agents`, `$DSH_AGENTS_HOME` (`dshHomeDisplay`/`agentsHomeDisplay`, `:183-197`). В окружении Host-процесса Desktop ни одна из переменных не задана.

Что доступно плагину:
- `ctx.dshHomePath(...segments)` – корневой контекст получает его через `ctx.provide('dshHomePath', dshHomePath)` (`$P/dsh-app-boot/src/index.ts:43-47, 1243`). Читать через `ctx.get('dshHomePath')` (так делает `dsh-context`). Он же доступен в `!!js` конфигах патча;
- аналога для agents home нет. Плагин должен повторить `resolveAgentsHome` (десять строк выше) или принять путь в своём `Config`.

## 10. Список workspace на Host

- Host-сервис `ctx.workspaceRegistry` (`@deepseek-ai/dsh-workspace`, `$P/dsh-workspace/src/index.ts:113-116, 186-212`): `list(): Workspace[]` – синхронно, в порядке реестра, без чтения хранилища (`:302-316`). Сервис ждёт `storageDomain` и `sessionPersistence`, поэтому в плагине его стоит брать через `ctx.inject(['workspaceRegistry'], …)` или `ctx.get`.
- `Workspace` (`$P/dsh-workspace/src/types.ts:69-153`): `id`, `path` (канонический realpath на момент создания), `title`, `createdAt`, `updatedAt`, `sessionIds`, `status(): Promise<'ok' | 'missing-dir'>`, плюс мутаторы. Ещё есть `resolveByPath(path): Promise<Workspace | undefined>` (Inspect).
- `dsh-api-workspace-controller` – Remote-фасад `ctx.remote.workspace` (`create`, `rename`, `delete`, `follow` и др.). На Client им пользуется сервис `ctx.workspaces` с полем `list: WorkspaceSource` (`$P/dsh-api-workspace-controller/src/client/index.ts:33-41`, `client/service.ts` `IWorkspaces`). Клиентская панель может взять список оттуда, не спрашивая Host. Форма `WorkspaceSource` и `WorkspaceView` в деталях не проверена, Client Inspect в этой сессии не ответил (timeout).

«Открытых» workspace как отдельного понятия нет: реестр хранит все зарегистрированные.

## Выводы для реализации

1. **Теневой провайдер – в слой агента, не в глобальный.** В Desktop `dsh-skill-filesystem` смонтирован в каждом пресете (слой пресета), host-строка отключена. Провайдер из `apply(ctx)` бандла попадает в глобальный слой и проигрывает по слоям при любом rank. Регистрировать на `agent.ctx` в слушателе `agent/created`. Это покрывает и субагентов. Disposer держать и в своём эффекте. Rank внутри слоя агента не важен, конкурентов там нет, но задать можно любой.
2. **Оригиналы брать из реестра со scope пресета**, а не сканировать самим: `ctx.skills.list/get({ cwd, scope: presetKey })` через `ctx.agentPresets.acquireScope(composedPreset(agent.ctx))`. Это даёт тот же парсер, те же корни и custom-корни, `get()` для `manual` проксирует на оригинал. Своё сканирование нужно только панели, чтобы показать перекрытые дубликаты.
3. **`customSkillDirs` не читать из Config.** API для этого нет, а в штатных пресетах значение – `!!js`. Относительные пути там разрешаются от cwd Host-процесса (каталог профиля), не от проекта. Значит, custom-корни всегда глобальные. `dsh-doc` приходит как `custom` из `app.asar` и доступен только для чтения.
4. **Меню `/` неживой сессии** не видит слой агента и покажет `off`-скиллы до первой активации агента. Это ограничение DSH, в UI его стоит назвать.
5. **Каталог модели обновится на следующем pre-step** после `invalidate()` дописанным сообщением-заменой (append-only). Каждое переключение `on ↔ manual/off` в живой сессии стоит одного такого сообщения.
6. **Правила: свой `source.kind`** (например, `dsh-loadout-rules`), `form: 'instructions'`, поля `baseline`, `baselineIdentity` и `changes[{action, scope, path, digest}]` по образцу `agent-instructions`. Состояние восстанавливать из `session.deriveMessages()`: `eventAt` депрекейтнут для нового кода. Вставлять после последнего сообщения `agent-instructions`, иначе после последнего claimed. Решение распространять (spread). На `reject` и на пустом первом шаге ничего не вставлять. Изменения ловить stat'ом на каждом pre-step, как делает `agent-instructions`, watcher для контекста не нужен. Слушатель корневой и получает все агенты, поэтому решить, нужны ли правила в пресете `minimal`.
7. **Связь Client ↔ Host – exact Fetch routes** `ctx.connection.fetch.register({ path: '/api/dsh-loadout/<op>', methods: ['POST'], requestBody: 'buffered', fetch })`, только для owner. Typert Remote из plain JS недоступен. SPEC стоит поправить: «Remote или Service» → «Fetch-маршрут на `/api`».
8. **Корзина – `gio trash`.** Host – Node-процесс без Electron, `shell.trashItem` недоступен. При ошибке ничего не удалять.
9. **Пути:** `ctx.dshHomePath()` для `$DSH_HOME`, свой резолв `$DSH_AGENTS_HOME` (пустое значение = не задано, `~` раскрывать).
10. **Workspace:** `ctx.workspaceRegistry.list()` на Host, `ctx.workspaces.list` на Client. `projectRoot` для группы workspace считать как в DSH: ближайший предок с `.git` (файл или каталог), иначе сам путь.
11. **YAML для правил.** `skill-filesystem` использует npm-пакет `yaml`. Если плагину нужен полный YAML во frontmatter правил, добавить `yaml` в `dependencies` бандла. Иначе ограничиться разбором `name`/`description` вручную и задокументировать ограничение.

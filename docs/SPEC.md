# dsh-loadout – спецификация

Плагин DSH, который управляет _снаряжением_ агента: какие скиллы и правила (rules) на нём надеты. Снаряжение живёт в `.agents/` проекта и в домашних каталогах. Плагин состоит из Host-части (фильтр каталога скиллов, подключение правил в контекст) и Client-части (панель управления в Web GUI).

Статус: первая версия реализована, ждёт установки и проверки на живом DSH. Заметки об API DSH, собранные для реализации, – в [research/](research/).

## Что делает

### Скиллы

- Панель показывает скиллы из всех корней, которые сканирует `dsh-skill-filesystem` (таблица ниже), включая `<projectRoot>/.dsh/skills` и custom-корни (`customSkillDirs`, в том числе встроенные скиллы из `app.asar`), сгруппированные по источнику. Как они делятся на глобальные и скиллы workspace – см. раздел «Панель».
- У каждого скилла три состояния:
  - `on` – как сейчас: в каталоге модели и в меню `/`;
  - `manual` – скрыт из каталога модели (в контекст запроса не попадает), но вызывается вручную через `/name`;
  - `off` – скрыт везде.
- Удаление: перемещает каталог `<name>/` или файл `<name>.md` в корзину после подтверждения в UI.
- Скилл, у которого во frontmatter уже стоит `disable-model-invocation: true`, показывается как `manual`, и включить его выше `manual` нельзя: файл – источник истины.

### Правила (rules)

- Правило – плоский файл `<file>.md` в корне правил (как в Kilo Code). Frontmatter необязателен; если он есть, панель берёт из него `name` и `description`, как у скиллов. Без frontmatter имя – это `<file>`, описания нет. В контекст модели уходит тело файла без frontmatter.
- Идентификатор правила (ключ в `loadout.json`) строится по имени файла, а не по `name` из frontmatter, чтобы переименование в frontmatter не сбрасывало состояние.
- Корни правил:

  | Уровень | Путь |
  |---|---|
  | проект | `<projectRoot>/.agents/rules/` |
  | глобальный | `~/.dsh/rules/` (`$DSH_HOME/rules`) |
  | глобальный | `~/.agents/rules/` (`$DSH_AGENTS_HOME/rules`) |

- Каждое правило включается и выключается по отдельности; удаляется в корзину после подтверждения. По умолчанию включено.
- Включённые правила попадают в контекст запроса наравне с AGENTS.md: тот же формат `<system-reminder>`, тот же приоритет («workspace instructions»), отдельное сообщение сразу после baseline `dsh-agent-instructions`.
- Субагенты получают правила так же, как основной агент. Проверить при реализации, как `dsh-agent-instructions` доставляет AGENTS.md дочерним агентам, и повторить тот же путь.
- Установку правил (создание в UI, импорт, URL) в первую версию не включаем: файлы кладутся руками.

### Состояние вкл/выкл – `loadout.json`

Состояние хранится в файлах, а не в профиле DSH, чтобы его можно было закоммитить и разделить с командой:

- `<projectRoot>/.agents/loadout.json` – скиллы и правила проекта (`.dsh/skills`, `.agents/skills`, `.agents/rules` проекта);
- `~/.agents/loadout.json` – глобальные скиллы и правила (`$DSH_HOME/skills`, `$DSH_AGENTS_HOME/skills`, `customSkillDirs`, `~/.dsh/rules`, `~/.agents/rules`).

Каждый файл управляет только элементами своего уровня: проектный файл не может выключить глобальный скилл или правило, и наоборот. Отсутствующая запись означает «включено». Набросок формата (глобальный файл):

```json
{
  "skills": { "omarchy": "off", "tdd": "manual" },
  "rules": { "dsh/russian-docs": false, "agents/commit-style": true }
}
```

Скиллы адресуются по имени, правила – как `<источник>/<file>` (`project`, `dsh`, `agents`), потому что в глобальном уровне два корня правил и одноимённые файлы в них – разные правила.

Если одноимённый скилл есть и в проекте, и глобально, DSH выбирает один по рангу (см. таблицу корней ниже). Состояние скилла определяет `loadout.json` того уровня, где лежит выигравший кандидат. Выключение проигравшего ни на что не влияет, и панель помечает его как перекрытый.

## Проверенные факты о DSH 0.2.2-rc.2

Прочитаны в README пакетов внутри `app.asar` (`node_modules/@deepseek-ai/<пакет>/README.md`, исходники – `src/`). Перед опорой на конкретный метод или событие сверь его с исходником.

### Скиллы: `dsh-skill`, `dsh-skill-filesystem`, `dsh-tool-skill`

- `dsh-skill` – реестр `ctx.skills`. Провайдер регистрируется через `ctx.skills.registerProvider(control => provider)` и получает `control.invalidate()`. Провайдер отдаёт `list()` (кандидаты) и `get()` (тело скилла).
- Дубликаты по имени внутри одного слоя решаются по `rank` (меньше – выигрывает), потом по порядку регистрации провайдеров, потом по порядку в `list()`. Слои: глобальный → пресет → агент; ближний слой заменяет одноимённый скилл целиком, rank между слоями не сравнивается.
- В Desktop host-строка `skill-filesystem` отключена (`dsh-web-app`), каждый пресет (`standard`, `ptc`, `cordis`) монтирует свой экземпляр в слой пресета. Провайдер из `apply(ctx)` бандла попадает в глобальный слой и проигрывает. Невалидный кандидат бросает исключение и роняет сбор слоя.
- У кандидата есть `invocation: { modelInvocable, userInvocable }`. `modelInvocable: false` убирает скилл из каталога модели и из инструмента `skill`. `userInvocable: false` убирает его из `/name` и из меню `/` (Remote `skills/list`).
- `dsh-skill-filesystem` сканирует корни в таком порядке рангов:

  | Rank | Источник | Путь |
  |---|---|---|
  | 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
  | 200 | `project-agents` | `<projectRoot>/.agents/skills` |
  | 300 | `custom` | `Config.customSkillDirs` |
  | 400 | `user-dsh` | `$DSH_HOME/skills` (пропускает `.system`) |
  | 500 | `user-agents` | `$DSH_AGENTS_HOME/skills` |

  `projectRoot` – ближайший предок с `.git`, иначе cwd. Скилл – это `<name>/SKILL.md` или `<name>.md` на верхнем уровне корня, frontmatter обязательно содержит `name` и `description`.
- `customSkillDirs` разрешаются через `path.resolve` от cwd Host-процесса, поэтому custom-корни всегда глобальные. Прочитать Config другого плагина нельзя: API нет, а в пресетах значение – `!!js`. Через custom приходят встроенные `dsh-doc` и `office*` из `app.asar` (только чтение).
- `dsh-tool-skill` на каждом pre-step сравнивает digest каталога и при изменении дописывает в историю новый каталог (append-only, KV-кэш не ломается).

### AGENTS.md: `dsh-agent-instructions`

- Монтируется внутри пресетов (не в `minimal`). При первом запросе вставляет одно durable user-сообщение (`<system-reminder>`): сначала глобальная цепочка `$DSH_HOME/AGENTS.md` → `~/.agents/AGENTS.md`, потом проектная, от корня проекта до cwd.
- Watcher'а нет: на каждом `pre-step` baseline-файлы сверяются через `stat`, обновление (`Updated instructions from:`) и удаление (`Instructions removed:`) дописываются отдельными сообщениями. Инструменты `read`/`write`/`edit` нужны только для вложенных каталогов.
- Сообщения – обычные sourced `user/message` с `source: { kind: 'agent-instructions', form: 'instructions', baseline?, changes }`, поэтому replay, resume и compaction работают без доработок. «Уже вставлено» определяется по поверхности сессии. Субагенты получают свой baseline на своём `pre-step`.
- Бюджет – `maxBytes` на цепочку (в пресетах 65536).

### Host и Client

- Host Desktop – отдельный Node-процесс (`ELECTRON_RUN_AS_NODE=1`), `shell.trashItem` недоступен; `/usr/bin/gio` есть.
- Typert Remote требует генерации кода при сборке и plain-JS бандлу недоступен. Client вызывает Host через `ctx.connection.fetch.register({ path: '/api/<plugin>/<op>', methods: ['POST'], requestBody: 'buffered', fetch })` – только для owner, как в `dsh-context`.
- Workspace: Host `ctx.workspaceRegistry.list()`, Client `props.useWorkspaces(s => s.items)` (`{ workspaceId, path, title }`). Понятия «открытого» workspace нет, только зарегистрированные.
- Превью в правой панели (`ctx.sidebarRight.openResource('dsh-resource://file/session/<sid>/<path>')`) работает только при сессии на экране.

Подробности и ссылки на исходники – [research/host-api.md](research/host-api.md) и [research/client-api.md](research/client-api.md).

### Правила расширения (`dsh-doc` → `references/practices.md`)

- Всё, что видит модель, должно восстанавливаться из лога сессии. Новые `type` событий не добавлять.
- Контекст агента добавляется через `agent.inject()` (логируется как `agent/inbox/spliced`) или через решение `agent/pre-step`. Если переписываешь `decision`, распространяй (spread) его целиком. `system-prompt/assemble` не трогать.
- Поведение для отдельного агента регистрировать на `agent.ctx` из `agent/created`.
- UI – React-компоненты в слотах, только токены темы `--dsw-alias-*`, свои контролы вместо импорта `dsh-client-ui-primitives`. Образец списка – страница Plugin Manager.

## Дизайн реализации

### Фильтр скиллов: теневой провайдер в слое агента

Файлы скиллов плагин не трогает. В слушателе `agent/created` (получает и субагентов) он регистрирует провайдер на `agent.ctx.skills` – это слой агента, он ближе слоя пресета. Disposer держится и в эффекте плагина. Для каждого скилла, у которого `loadout.json` сужает политику файла, провайдер отдаёт кандидата с тем же `name`, `description`, `whenToUse`, `source` и политикой:

- `manual` → `{ modelInvocable: false, userInvocable: true }`; `get()` берёт оригинал из реестра и возвращает его с нашей политикой и `provider`;
- `off` → `{ modelInvocable: false, userInvocable: false }`; `get()` возвращает `undefined`.

Оригиналы `list()` и `get()` читают из реестра со scope пресета агента: `ctx.agentPresets.acquireScope(composedPreset(agent.ctx))` → `ctx.skills.list/get({ cwd, scope: lease.key })`. Цепочка `[presetKey]` не включает слой агента, рекурсии нет. Так покрываются и custom-скиллы, корни которых плагин не знает. Уровень `loadout.json` выбирается по `source` победителя: `project-*` – проектный, остальные – глобальный.

Каталог модели обновляется штатно: `dsh-tool-skill` сравнивает digest на следующем `pre-step` и дописывает новый каталог. После изменения `loadout.json` (панель, инструмент, `fs/observed`) плагин вызывает `invalidate()` у всех живых провайдеров.

Ограничение DSH: меню `/` у сессии, где агент ещё не создан, читает реестр без слоя агента и показывает `off`-скиллы.

### Правила в контексте

Механика повторяет `dsh-agent-instructions` и работает только у агентов, в композиции которых он есть: `ctx.agentPresets.inspectCompositions(agent.ctx)` содержит модуль `@deepseek-ai/dsh-agent-instructions`.

- Слушатель `agent/pre-step` (waterfall): сначала `await next()`, на `reject` и на пустом первом шаге решение возвращается без изменений.
- На первом подходящем шаге – baseline со всеми включёнными правилами (сначала `dsh`, `agents`, потом `project`). Вставка – сразу после последнего сообщения `agent-instructions`, иначе после последнего claimed-сообщения; решение распространяется (spread).
- На каждом шаге правила сверяются заново (`stat` + дайджест, watcher не нужен). Разница с увиденным – одно сообщение с секциями `Additional rule from` / `Updated rule from` / `Rule removed`.
- Сообщение – `user/message` с `source: { kind: 'dsh-loadout-rules', form: 'instructions', baseline?: true, projectRoot, snapshot }`, где `snapshot` – `{ displayPath: digest }` после этого сообщения. Состояние восстанавливается из последнего такого сообщения на поверхности сессии (`session.deriveMessages()`), поэтому replay, resume, fork и compaction работают без отдельного хранилища. Смена `projectRoot` – новый baseline.
- `displayPath`: `~/.dsh/rules/<file>.md`, `~/.agents/rules/<file>.md`, проектные – относительно `projectRoot`.
- Бюджет `maxBytes` (Config, по умолчанию 65536) на одно сообщение: сначала отбрасываются самые широкие правила, потом обрезается последнее, в начале – маркер `Rule budget N bytes: …`. Отброшенные записываются в снапшот как `omitted:<digest>` и не повторяются, пока не изменятся.

Шаблон baseline (текст для модели, английский, как у AGENTS.md):

```markdown
<system-reminder>
The following rules apply to your work. Treat them like workspace instructions: more specific rules take precedence over broader ones, and they do not override system, developer, or direct user instructions.

Rule from: ~/.dsh/rules/<file>.md

<rule body without frontmatter>

Rule from: .agents/rules/<file>.md

<rule body without frontmatter>
</system-reminder>
```

### Панель

Панель глобальная и не привязана к сессии. Это пункт левого меню рядом с Plugins и Automation tasks: иконка и подпись в слоте `sidebar.panellist` (`id: 'loadout'`, `order: 20`), страница – в слоте `main` с `key: 'loadout'`, в центральной колонке вместо чата. Вёрстка – как у страницы Plugins (колонка до 960 px). Страница показывает одну область за раз. Сверху вниз:

Шапка повторяет страницу Plugins и остаётся на месте при прокрутке: слева заголовок, подзаголовок и строка с путём области и `loadout.json`, справа выбор области, последней строкой – вкладки.

1. **Выбор области** – список в стиле контурной кнопки: «Глобальные», затем зарегистрированные workspace (`props.useWorkspaces(s => s.items)`). Без workspace список неактивен. Выбор запоминается в `localStorage`.
   - «Глобальные» – из `$DSH_HOME/skills`, `$DSH_AGENTS_HOME/skills`, custom-корней, `~/.dsh/rules/`, `~/.agents/rules/`; пишет в `~/.agents/loadout.json`.
   - Workspace – из `<projectRoot>/.dsh/skills`, `<projectRoot>/.agents/skills` и `<projectRoot>/.agents/rules/`, где `projectRoot` – ближайший предок с `.git`; пишет в `<projectRoot>/.agents/loadout.json`.
2. **Вкладки по видам элементов** – «Скиллы», «Правила» и «Инструкции» с числом элементов (`role="tablist"`, стрелки и Home/End, стиль `SegmentedTabs` размера `sm`). Новый вид – одна запись в списке `KINDS` в `client.js` и один список в ответе Host. Выбранная вкладка запоминается.
   - «Инструкции» – файлы, которые грузит `dsh-agent-instructions` (значения по умолчанию): глобально `AGENTS.md` в `$DSH_HOME` и `$DSH_AGENTS_HOME`; в workspace – `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.md`, `CLAUDE.local.md` в каждой папке от корня проекта до папки workspace, сгруппированные по папке. Только просмотр: переключателя и удаления нет, загрузкой управляет DSH, а не `loadout.json`. Если пресет переопределил кандидатов в своём Config, список может разойтись с тем, что видит агент.
3. **Список выбранного вида** – группировка по источнику: над каждой группой заголовок 14/500 с числом элементов, сами строки – в карточке (`--dsw-alias-settings-card-fill` / `-stroke`, как в разделах Models и Agent presets). В строке справа «Открыть», кнопка удаления 28×28 и переключатель; подтверждение удаления и текст файла – под строкой.

Custom-корни панель выводит из `path` кандидатов реестра с `source: 'custom'` (scope пресета по умолчанию, `acquireScope()`), сами корни сканирует своим сканером, чтобы показать и перекрытые дубликаты. Custom-скиллы глобальные. Файлы внутри `app.asar` (`dsh-doc`, `office*`) только для чтения: переключать можно, удалять нельзя.

В строке: имя и описание (из frontmatter), путь, переключатель (у скилла – трёхпозиционный), «Открыть» и «Удалить».

- «Открыть»: текст файла раскрывается прямо в строке (читает Host). Правая панель с превью недоступна: пока страница занимает центральную колонку, сессии на экране нет.
- «Удалить»: подтверждение в самой строке, затем `gio trash -- <path>` на Host. Если корзина недоступна, показать ошибку и не удалять безвозвратно.

### Операции Host

Операции реализуются один раз в Host и вызываются двумя путями:

- панель – `POST /api/dsh-loadout/<op>` через `ctx.connection.fetch.register` (только owner), ответ `{ ok: true, value } | { ok: false, error: { code, message } }`;
- агент – инструмент `loadout` с `action: 'list' | 'set'`: список скиллов и правил с состояниями и переключение. Удаление в корзину остаётся только у пользователя.
